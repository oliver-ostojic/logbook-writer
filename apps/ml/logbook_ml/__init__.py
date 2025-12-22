"""
Logbook ML - Schedule Learning Module

A PyTorch-based machine learning module that learns from historical logbook data,
manager adjustments, and crew feedback to improve future schedule generation.
"""

__version__ = "0.1.0"

from logbook_ml.model.unified_model import UnifiedScheduleModel
from logbook_ml.data.tensors import (
    LogbookTensor,
    AdjustmentTensor,
    CrewRatingTensor,
    StatisticsTensor,
)

__all__ = [
    "UnifiedScheduleModel",
    "LogbookTensor",
    "AdjustmentTensor",
    "CrewRatingTensor",
    "StatisticsTensor",
]
