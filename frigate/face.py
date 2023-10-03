"""Record events for object, audio, etc. detections."""

import logging
import queue
import threading
from multiprocessing import Queue
from multiprocessing.synchronize import Event as MpEvent

from frigate.config import FrigateConfig
from frigate.events.maintainer import EventTypeEnum
from frigate.models import Face
from frigate.util.builtin import to_relative_box

logger = logging.getLogger(__name__)

face_capture = False

class FaceProcessor(threading.Thread):
    """Handle timeline queue and update DB."""

    def __init__(
        self,
        config: FrigateConfig,
        queue: Queue,
        stop_event: MpEvent,
    ) -> None:
        threading.Thread.__init__(self)
        self.name = "face_processor"
        self.config = config
        self.queue = queue
        self.stop_event = stop_event

    def run(self) -> None:
        while not self.stop_event.is_set():
            try:
                (
                    type,
                    id,
                    label_id,
                    capture_time,
                ) = self.queue.get(timeout=1)
            except queue.Empty:
                continue

            if type == "face":
                self.handle_face(
                    id, label_id, capture_time
                )

    def handle_face(
        self,
        id: str,
        label_id: int,
        capture_time,
    ) -> None:
        """Handle face detection."""

        face_entry = {
            Face.id: id,
            Face.label_id: label_id,
            Face.capture_time: capture_time,
            Face.data: {},
        }

        Face.insert(face_entry).execute()