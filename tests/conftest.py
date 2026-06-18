import os
import sys

# Make repo-root modules (transcription_config, auto_scanner, ...) importable from tests.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
