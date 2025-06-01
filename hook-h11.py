# PyInstaller hook for h11
from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = collect_all('h11')

# Ensure all h11 submodules are included
hiddenimports += [
    'h11',
    'h11._connection',
    'h11._events',
    'h11._state',
    'h11._util',
    'h11._headers',
    'h11._receivebuffer',
]
