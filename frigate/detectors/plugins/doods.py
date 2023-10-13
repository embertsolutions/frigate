import io
import logging
import json
import base64

import numpy as np
import requests
from PIL import Image
from pydantic import Field
from typing_extensions import Literal

from frigate.detectors.detection_api import DetectionApi
from frigate.detectors.detector_config import BaseDetectorConfig

logger = logging.getLogger(__name__)

DETECTOR_KEY = "DOODS"

class DoodsDetectorConfig(BaseDetectorConfig):
    type: Literal[DETECTOR_KEY]
    api_url: str = Field(
        default="http://localhost:8080/detectfaces", title="DOODS API URL"
    )
    api_timeout: float = Field(default=0.2, title="DOODS API timeout (in seconds)")
    api_key: str = Field(default="", title="DOODS API key (if required)")


class Doods(DetectionApi):
    type_key = DETECTOR_KEY

    def __init__(self, detector_config: DoodsDetectorConfig):
        self.api_url = detector_config.api_url
        self.api_timeout = detector_config.api_timeout
        self.api_key = detector_config.api_key
        self.labels = detector_config.model.merged_labelmap
        self.facelabels = detector_config.model.merged_facelabelmap

    def detect_raw(self, tensor_input):
        detections = np.zeros((20, 134), np.float32)
        image_data = np.squeeze(tensor_input).astype(np.uint8)
        image = Image.fromarray(image_data)
        self.w, self.h = image.size
        with io.BytesIO() as output:
            image.save(output, format="JPEG")
            image_bytes = output.getvalue()

        base64_bytes = base64.b64encode(image_bytes)
        base64_string = base64_bytes.decode('utf-8')

        data = { "api_key": self.api_key, "data": base64_string }

        try:
            response = requests.post(
                self.api_url,
                json = data,
                timeout=self.api_timeout,
            )
        except:
            return detections

        response_json = response.json()

        if response_json.get("predictions") is None:
            logger.info(f"Error in parsing response json: {response_json}")
            return detections

        for i, detection in enumerate(response_json.get("predictions")):
            if detection["confidence"] < 0.4:
                logger.info("Break due to confidence < 0.4")
                break
            if i == 20:
                break
           
            detections[i][0] = 0
            detections[i][1] = float(detection["confidence"])
            detections[i][2] = detection["y_min"]
            detections[i][3] = detection["x_min"]
            detections[i][4] = detection["y_max"]
            detections[i][5] = detection["x_max"]
            for g, embedding in enumerate(detection.get("embeddings")):
                detections[i][6+g] = embedding

        return detections
