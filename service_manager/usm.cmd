@echo off
rem usm <command>  -  CLI for the service manager (see cli.py)
rem Uses service_manager\.venv if it exists, else the active env (e.g. after `workon usm`).
if exist "%~dp0.venv\Scripts\python.exe" (
  "%~dp0.venv\Scripts\python.exe" "%~dp0cli.py" %*
) else (
  python "%~dp0cli.py" %*
)
