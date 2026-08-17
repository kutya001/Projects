@echo off
chcp 65001 >nul
echo ============================================================
echo   Сборка Projects SPA в EXE
echo ============================================================
echo.

REM Use specific Python path
set PYTHON=C:\Users\OmuralievK\AppData\Local\Python\bin\python3.14.exe

REM Check Python
%PYTHON% --version >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Python не найден по пути: %PYTHON%
    echo Попробуйте указать правильный путь к Python 3.10+
    pause
    exit /b 1
)

REM Install dependencies
echo [1/3] Установка зависимостей...
%PYTHON% -m pip install -r requirements.txt
if errorlevel 1 (
    echo [ОШИБКА] Не удалось установить зависимости
    pause
    exit /b 1
)

REM Build EXE
echo.
echo [2/3] Сборка EXE через PyInstaller...
%PYTHON% -m PyInstaller ProjectsSPA.spec --clean --noconfirm
if errorlevel 1 (
    echo [ОШИБКА] Сборка не удалась
    pause
    exit /b 1
)

echo.
echo [3/3] Готово!
echo.
echo   EXE файл: dist\ProjectsSPA.exe
echo   Скопируйте его в папку на сервере.
echo   При запуске он создаст файл projects.db рядом с собой.
echo   Несколько пользователей могут подключаться по сети.
echo.
echo ============================================================
pause
