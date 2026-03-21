# PyInstaller hook for httptools
from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = collect_all('httptools')

# Ensure all httptools submodules are included
hiddenimports += [
    'httptools',
    'httptools.parser',
    'httptools.parser.errors',
]
