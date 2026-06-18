@echo off
echo Building A+ GEX Live indicator...
dotnet build -c Release -r win-x64 --no-self-contained
if %ERRORLEVEL% == 0 (
    echo.
    echo SUCCESS — copy this file to Quantower:
    echo   bin\Release\net6.0-windows\win-x64\APlus_GEX_Live.dll
    echo.
    echo Drop it in:
    echo   C:\Users\%USERNAME%\Documents\Quantower\Indicators\
    echo.
    echo Then restart Quantower and search for "A+ GEX" in the indicator list.
) else (
    echo.
    echo BUILD FAILED — make sure TradingPlatform.BusinessLayer.dll is in this folder.
)
pause
