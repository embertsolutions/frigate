import datetime
import time
import logging
import multiprocessing as mp
import os
import queue
import signal
import threading
from abc import ABC, abstractmethod

import numpy as np
from setproctitle import setproctitle

from frigate.detectors import create_detector
from frigate.detectors.detector_config import InputTensorEnum
from frigate.util.builtin import EventsPerSecond, load_labels
from frigate.util.image import SharedMemoryFrameManager
from frigate.util.services import listen
from frigate.object_detection import ObjectDetector, tensor_transform

logger = logging.getLogger(__name__)

class LocalFaceDetector(ObjectDetector):
    def __init__(
        self,
        detector_config=None,
        labels=None,
    ):
        self.fps = EventsPerSecond()
        if labels is None:
            self.labels = {}
        else:
            self.labels = load_labels(labels)

        if detector_config:
            self.input_transform = tensor_transform(detector_config.model.input_tensor)
        else:
            self.input_transform = None

        self.detect_api = create_detector(detector_config)

    def detect(self, tensor_input, threshold=0.4):
        detections = []

        raw_detections, timeout = self.detect_raw(tensor_input)

        for d in raw_detections:
            if int(d[0]) < 0 or int(d[0]) >= len(self.labels):
                logger.warning(f"Raw Detect returned invalid label: {d}")
                continue
            if d[1] < threshold:
                break
            detections.append(
                (self.labels[int(d[0])], float(d[1]), (d[2], d[3], d[4], d[5]))
            )
        self.fps.update()
        return detections

    def detect_raw(self, tensor_input):
        if self.input_transform:
            tensor_input = np.transpose(tensor_input, self.input_transform)
        start = time.monotonic_ns()
        raw_detections, timeout = self.detect_api.detect_raw(tensor_input=tensor_input)
        stop = time.monotonic_ns()
        elapsed = round((stop - start) / 1000000, 0)
        logger.info(f"Face Detect Time: {elapsed}ms Timeout: {timeout}")
        return raw_detections, timeout


def run_detector(
    name: str,
    detection_queue: mp.Queue,
    out_events: dict[str, mp.Event],
    avg_speed,
    start,
    detector_config,
):
    threading.current_thread().name = f"detector:{name}"
    logger = logging.getLogger(f"detector.{name}")
    logger.info(f"Starting detection process: {os.getpid()}")
    setproctitle(f"frigate.detector.{name}")
    listen()

    stop_event = mp.Event()

    def receiveSignal(signalNumber, frame):
        logger.info("Signal to exit detection process...")
        stop_event.set()

    signal.signal(signal.SIGTERM, receiveSignal)
    signal.signal(signal.SIGINT, receiveSignal)

    frame_manager = SharedMemoryFrameManager()
    object_detector = LocalFaceDetector(detector_config=detector_config)

    outputs = {}
    for name in out_events.keys():
        out_shm = mp.shared_memory.SharedMemory(name=f"out-face{name}", create=False)
        out_np = np.ndarray((20, 134), dtype=np.float32, buffer=out_shm.buf)
        outputs[name] = {"shm": out_shm, "np": out_np}

    while not stop_event.is_set():
        try:
            connection_id = detection_queue.get(timeout=1)
        except queue.Empty:
            continue

        input_frame = frame_manager.get(
            f"face{connection_id}",
            (1, detector_config.model.face_detection_height, detector_config.model.face_detection_width, 3),
        )

        if input_frame is None:
            continue

        # detect and send the output
        start.value = datetime.datetime.now().timestamp()
        detections, timeout = object_detector.detect_raw(input_frame)
        duration = datetime.datetime.now().timestamp() - start.value
        outputs[connection_id]["np"][:] = detections[:]
        out_events[connection_id].set()
        start.value = 0.0

        avg_speed.value = (avg_speed.value * 9 + duration) / 10

        if timeout == True:
            time.sleep(detector_config.model.face_recognition_pause_on_timeout)

    logger.info("Exited detection process...")


class FaceDetectProcess:
    def __init__(
        self,
        name,
        detection_queue,
        out_events,
        detector_config,
    ):
        self.name = name
        self.out_events = out_events
        self.detection_queue = detection_queue
        self.avg_inference_speed = mp.Value("d", 0.01)
        self.detection_start = mp.Value("d", 0.0)
        self.detect_process = None
        self.detector_config = detector_config
        self.start_or_restart()

    def stop(self):
        # if the process has already exited on its own, just return
        if self.detect_process and self.detect_process.exitcode:
            return
        self.detect_process.terminate()
        logging.info("Waiting for detection process to exit gracefully...")
        self.detect_process.join(timeout=30)
        if self.detect_process.exitcode is None:
            logging.info("Detection process didnt exit. Force killing...")
            self.detect_process.kill()
            self.detect_process.join()
        logging.info("Detection process has exited...")

    def start_or_restart(self):
        self.detection_start.value = 0.0
        if (self.detect_process is not None) and self.detect_process.is_alive():
            self.stop()
        self.detect_process = mp.Process(
            target=run_detector,
            name=f"detector:{self.name}",
            args=(
                self.name,
                self.detection_queue,
                self.out_events,
                self.avg_inference_speed,
                self.detection_start,
                self.detector_config,
            ),
        )
        self.detect_process.daemon = True
        self.detect_process.start()

class RemoteFaceDetector:
    def __init__(self, name, labels, detection_queue, event, model_config, stop_event):
        self.labels = labels
        self.name = name
        self.fps = EventsPerSecond()
        self.detection_queue = detection_queue
        self.event = event
        self.stop_event = stop_event
        self.shm = mp.shared_memory.SharedMemory(name=f"face{self.name}", create=False)
        self.np_shm = np.ndarray(
            (1, model_config.face_detection_height, model_config.face_detection_width, 3),
            dtype=np.uint8,
            buffer=self.shm.buf,
        )
        logger.info(f"RemoteFaceDetector.__init__:{self.np_shm.shape}")
        self.out_shm = mp.shared_memory.SharedMemory(
            name=f"out-face{self.name}", create=False
        )
        self.out_np_shm = np.ndarray((20, 134), dtype=np.float32, buffer=self.out_shm.buf)

    def detect(self, tensor_input, threshold=0.4):
        detections = []

        if self.stop_event.is_set():
            return detections

        # copy input to shared memory
        self.np_shm[:] = tensor_input[:]
        self.event.clear()
        self.detection_queue.put(self.name)
        result = self.event.wait(timeout=5.0)

        # if it timed out
        if result is None:
            return detections

        for d in self.out_np_shm:
            if d[1] < threshold:
                break
            entry = []
            entry.append(self.labels[int(d[0])])
            entry.append(float(d[1]))
            entry.append((d[2], d[3], d[4], d[5]))
            result = []
            for x in range(128): 
                result.append(d[x+6])
            entry.append(result)
            detections.append(entry)

        self.fps.update()
        return detections

    def cleanup(self):
        self.shm.unlink()
        self.out_shm.unlink()
