@echo off
REM JoyMaze Daily Pipeline — Task Scheduler entry point
REM Logs stdout+stderr to logs\daily-run.log for debugging
REM Single-hop: no npm, no scheduler wrapper

set LOGFILE=D:\Joymaze-Content\logs\daily-run.log

echo [%DATE% %TIME%] === Scheduled daily run starting === >> %LOGFILE%

D:\node\node.exe D:\Joymaze-Content\scripts\daily-run.mjs >> %LOGFILE% 2>&1

if %ERRORLEVEL% NEQ 0 (
  echo [%DATE% %TIME%] FAILED with exit code %ERRORLEVEL% >> %LOGFILE%
) else (
  echo [%DATE% %TIME%] Completed successfully >> %LOGFILE%
)
