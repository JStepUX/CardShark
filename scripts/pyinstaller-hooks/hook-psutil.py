# PyInstaller hook for psutil
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

# Collect all psutil submodules
hiddenimports = collect_submodules('psutil')

# Add Windows-specific imports
hiddenimports.extend([
    'psutil._psutil_windows',
    'psutil._pswindows', 
    'psutil._psplatform',
    'psutil._common'
])

# Collect data files
datas = collect_data_files('psutil')
