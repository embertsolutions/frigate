import hashlib
import json
import logging
import os
from enum import Enum
from typing import Dict, Optional, Tuple

import matplotlib.pyplot as plt
import requests
from pydantic import BaseModel, Extra, Field
from pydantic.fields import PrivateAttr

from frigate.plus import PlusApi
from frigate.util.builtin import load_labels

logger = logging.getLogger(__name__)


class PixelFormatEnum(str, Enum):
    rgb = "rgb"
    bgr = "bgr"
    yuv = "yuv"


class InputTensorEnum(str, Enum):
    nchw = "nchw"
    nhwc = "nhwc"


class ModelTypeEnum(str, Enum):
    ssd = "ssd"
    yolox = "yolox"
    yolov5 = "yolov5"
    yolov8 = "yolov8"


class ModelConfig(BaseModel):
    path: Optional[str] = Field(title="Custom Object detection model path.")
    labelmap_path: Optional[str] = Field(title="Label map for custom object detector.")
    facelabelmap_path: Optional[str] = Field(title="Face label map for custom object detector.")
    width: int = Field(default=320, title="Object detection model input width.")
    height: int = Field(default=320, title="Object detection model input height.")
    labelmap: Dict[int, str] = Field(
        default_factory=dict, title="Labelmap customization."
    )
    facelabelmap: Dict[int, str] = Field(
        default_factory=dict, title="FaceLabelmap customization."
    )
    input_tensor: InputTensorEnum = Field(
        default=InputTensorEnum.nhwc, title="Model Input Tensor Shape"
    )
    input_pixel_format: PixelFormatEnum = Field(
        default=PixelFormatEnum.rgb, title="Model Input Pixel Color Format"
    )
    model_type: ModelTypeEnum = Field(
        default=ModelTypeEnum.ssd, title="Object Detection Model Type"
    )
    face_detection_width: int = Field(default=320, title="Face detection model input width.")
    face_detection_height: int = Field(default=320, title="Face detection model input height.")
    face_recognition_model: Optional[str] = Field(
        default="DOODS_COS", title="Face Recognition Model.")
    face_recognition_area: Optional[str] = Field(
        default="Regions", title="Areas to run Face Recognition on.")
    face_recognition_pause_on_timeout: Optional[float] = Field(
        default=0.05, title="Face Recognition pause on timeout."
    )
    face_recognition_width_crop: Optional[float] = Field(
        default=0.70, title="Face Recognition percentage crop from Detection."
    )
    face_recognition_height_crop: Optional[float] = Field(
        default=0.70, title="Face Recognition percentage crop from Detection."
    )
    face_recognition_min_area: int = Field(
        default=0, title="Face Recognition Minimum area of bounding box for object to be counted."
    )
    face_recognition_max_area: int = Field(
        default=24000000, title="Face Recognition Maximum area of bounding box for object to be counted."
    )
    face_recognition_max_score_conversion: Optional[float] = Field(
        default=100, title="Face Recognition Inverse scale for value."
    )
    face_recognition_min_score: Optional[float] = Field(
        default=0.5, title="Face Recognition Minimum detection confidence for object to be counted."
    )
    face_training_camera: Optional[str] = Field(default="Any", title="Face Training Camera.")
    face_training_unknown_only: Optional[bool] = Field(default=True, title="Face Training unknown faces only.")

    _merged_labelmap: Optional[Dict[int, str]] = PrivateAttr()
    _merged_facelabelmap: Optional[Dict[int, str]] = PrivateAttr()
    _colormap: Dict[int, Tuple[int, int, int]] = PrivateAttr()
    _model_hash: str = PrivateAttr()

    @property
    def merged_labelmap(self) -> Dict[int, str]:
        return self._merged_labelmap

    @property
    def merged_facelabelmap(self) -> Dict[int, str]:
        return self._merged_facelabelmap

    @property
    def colormap(self) -> Dict[int, Tuple[int, int, int]]:
        return self._colormap

    @property
    def model_hash(self) -> str:
        return self._model_hash

    def __init__(self, **config):
        super().__init__(**config)

        self._merged_labelmap = {
            **load_labels(config.get("labelmap_path", "/labelmap.txt")),
            **config.get("labelmap", {}),
        }
        self._merged_facelabelmap = {
            **load_labels(config.get("facelabelmap_path", "/facelabelmap.txt")),
            **config.get("facelabelmap", {}),
        }
        self._colormap = {}

    def check_and_load_plus_model(
        self, plus_api: PlusApi, detector: str = None
    ) -> None:
        if not self.path or not self.path.startswith("plus://"):
            return

        model_id = self.path[7:]
        self.path = f"/config/model_cache/{model_id}"
        model_info_path = f"{self.path}.json"

        # download the model if it doesn't exist
        if not os.path.isfile(self.path):
            download_url = plus_api.get_model_download_url(model_id)
            r = requests.get(download_url)
            with open(self.path, "wb") as f:
                f.write(r.content)

        # download the model info if it doesn't exist
        if not os.path.isfile(model_info_path):
            model_info = plus_api.get_model_info(model_id)
            with open(model_info_path, "w") as f:
                json.dump(model_info, f)
        else:
            with open(model_info_path, "r") as f:
                model_info = json.load(f)

        if detector and detector not in model_info["supportedDetectors"]:
            raise ValueError(f"Model does not support detector type of {detector}")

        self.width = model_info["width"]
        self.height = model_info["height"]
        self.input_tensor = model_info["inputShape"]
        self.input_pixel_format = model_info["pixelFormat"]
        self.model_type = model_info["type"]
        self._merged_labelmap = {
            **{int(key): val for key, val in model_info["labelMap"].items()},
            **self.labelmap,
        }
        self._merged_facelabelmap = {
            **{int(key): val for key, val in model_info["facelabelMap"].items()},
            **self.facelabelmap,
        }

    def compute_model_hash(self) -> None:
        if not self.path or not os.path.exists(self.path):
            self._model_hash = hashlib.md5(b"unknown").hexdigest()
        else:
            with open(self.path, "rb") as f:
                file_hash = hashlib.md5()
                while chunk := f.read(8192):
                    file_hash.update(chunk)
            self._model_hash = file_hash.hexdigest()

    def create_colormap(self, enabled_labels: set[str]) -> None:
        """Get a list of colors for enabled labels."""
        cmap = plt.cm.get_cmap("tab10", len(enabled_labels))

        for key, val in enumerate(enabled_labels):
            self._colormap[val] = tuple(int(round(255 * c)) for c in cmap(key)[:3])

    class Config:
        extra = Extra.forbid


class BaseDetectorConfig(BaseModel):
    # the type field must be defined in all subclasses
    type: str = Field(default="cpu", title="Detector Type")
    model: ModelConfig = Field(
        default=None, title="Detector specific model configuration."
    )

    class Config:
        extra = Extra.allow
        arbitrary_types_allowed = True
