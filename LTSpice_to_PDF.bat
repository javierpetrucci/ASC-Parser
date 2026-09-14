@echo off
setlocal EnableExtensions EnableDelayedExpansion
title LTSpice to PDF - Herramientas

REM Trabajar siempre en la carpeta del repo, sin importar desde donde se clickee.
pushd "%~dp0"

REM Puerto y direcciones del servidor local, en un solo lugar.
set "PORT=8000"
set "APP_URL=http://localhost:%PORT%/"
set "TUNER_URL=http://localhost:%PORT%/tools/dev_window_tuner.html"

REM Node es el unico requisito: sirve la app, compila el .exe y corre los generadores.
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo   No se encontro Node.js en el PATH.
    echo   Instalalo desde https://nodejs.org y volve a abrir esta ventana.
    echo.
    pause
    popd
    exit /b 1
)

:menu
cls
echo ==========================================================
echo    LTSpice to PDF  -  Herramientas
echo ==========================================================
echo.
echo    PROBAR LA APP
echo      [1]  Abrir en el navegador       (servidor local)
echo      [2]  Abrir la app de escritorio  (modo desarrollo)
echo.
echo    COMPILAR
echo      [3]  Compilar el .exe de Windows
echo      [4]  Compilar TODAS las plataformas  (lento, ~300 MB)
echo      [5]  Abrir la carpeta dist  (ver lo compilado)
echo.
echo    MANTENIMIENTO
echo      [6]  Regenerar archivos derivados  (spec + lista del tuner)
echo      [7]  Abrir el Window Tuner         (posicion de las etiquetas)
echo.
echo      [Q]  Salir
echo.
set "opt="
set /p "opt=  Elegi una opcion: "

if /i "!opt!"=="1" goto serve
if /i "!opt!"=="2" goto desktop
if /i "!opt!"=="3" goto build
if /i "!opt!"=="4" goto buildall
if /i "!opt!"=="5" goto opendist
if /i "!opt!"=="6" goto regen
if /i "!opt!"=="7" goto tuner
if /i "!opt!"=="Q" goto fin
goto menu

:serve
cls
echo.
call :ensure_server
if errorlevel 1 (
    echo.
    pause
    goto menu
)
echo.
echo   Abriendo la app:
echo     !APP_URL!
echo.
echo   El Window Tuner esta en la opcion [7], o directo en:
echo     !TUNER_URL!
echo.
start "" "!APP_URL!"
timeout /t 2 >nul
goto menu

:tuner
cls
echo.
echo   WINDOW TUNER  -  posicion de las etiquetas de cada componente
echo.
echo   Dibuja un componente en sus 8 orientaciones con el MISMO motor que
echo   la web, te deja mover las etiquetas, y te da el JSON para pegar en
echo   engine\component_defaults.js.
echo.
call :ensure_server
if errorlevel 1 (
    echo.
    pause
    goto menu
)
echo.
echo   Abriendo el tuner:
echo     !TUNER_URL!
echo.
start "" "!TUNER_URL!"
timeout /t 2 >nul
goto menu

REM ── Servidor local ──────────────────────────────────────────────────────
REM Deja el servidor andando en el puerto !PORT! y vuelve con errorlevel 0.
REM Si ya habia uno, lo reutiliza en vez de fallar con EADDRINUSE: al cerrar
REM la pestana del navegador el servidor sigue vivo, y antes no habia forma
REM de volver a abrir la pagina desde este menu.
:ensure_server
call :is_listening
if not errorlevel 1 (
    echo   Ya hay un servidor escuchando en el puerto !PORT!: lo reuso.
    exit /b 0
)
echo   Levantando el servidor en el puerto !PORT!...
echo   Se abre en una ventana aparte: cerrala para detener el servidor.
REM --no-open: la pagina la abre este menu, asi la opcion [7] no arrastra
REM tambien la app.
start "LTSpice to PDF - servidor" cmd /k node "%~dp0tools\serve.js" !PORT! --no-open
set /a _tries=0
:wait_server
REM ping en vez de timeout: timeout aborta si alguien corre este .bat con la
REM entrada redirigida, y ahi el bucle giraria en vacio.
ping -n 2 127.0.0.1 >nul
call :is_listening
if not errorlevel 1 exit /b 0
set /a _tries+=1
if !_tries! lss 15 goto wait_server
echo.
echo   El servidor no levanto. Mira que dice la ventana
echo   "LTSpice to PDF - servidor".
exit /b 1

REM Errorlevel 0 si algo esta escuchando en el puerto. El espacio en ":!PORT! "
REM es a proposito: sin el, un puerto como 18000 tambien daria positivo.
:is_listening
netstat -an | findstr /c:":!PORT! " | findstr /c:"LISTENING" >nul 2>&1
exit /b !errorlevel!

:desktop
cls
echo.
echo   Abriendo la app de escritorio en modo desarrollo...
echo   Se abre en una ventana aparte: cerrala para detenerla.
echo.
REM Equivale a: npx @neutralinojs/neu run
start "LTSpice to PDF - modo dev" cmd /k call npm start
timeout /t 2 >nul
goto menu

:build
cls
echo.
echo   Compilando solo el ejecutable de Windows (~15 MB)...
echo.
call npm run build
echo.
pause
goto menu

:buildall
cls
echo.
echo   Esto compila las 7 plataformas y ocupa ~300 MB en dist\.
set "sure="
set /p "sure=  Seguro? (S/N): "
if /i not "!sure!"=="S" goto menu
echo.
call npm run build:all
echo.
pause
goto menu

:opendist
if exist "%~dp0dist\LTSpice_to_PDF" (
    start "" explorer "%~dp0dist\LTSpice_to_PDF"
) else (
    echo.
    echo   Todavia no hay nada compilado. Usa la opcion [3].
    echo.
    pause
)
goto menu

:regen
cls
echo ==========================================================
echo    Regenerar archivos derivados
echo ==========================================================
echo.
echo   Hay dos archivos que NO se editan a mano: se generan desde
echo   el codigo y desde los .asy que hay en disco. Si los editas
echo   a mano, el proximo build los pisa.
echo.
echo   1) Seccion 9 de la especificacion
echo      Se genera desde  engine\component_defaults.js
echo      Son las ~525 filas con la posicion de cada etiqueta
echo      (InstName, Value) para cada componente y orientacion.
echo.
echo   2) Lista de componentes del WINDOW TUNER
echo      Se genera desde  Assets\Component Symbols\
echo.
echo   El Window Tuner (tools\dev_window_tuner.html) es una
echo   herramienta de desarrollo: dibuja un componente en sus 8
echo   orientaciones usando el MISMO motor que la web, te deja
echo   mover las etiquetas hasta que queden bien, y te da el JSON
echo   para pegar en engine\component_defaults.js.
echo   Se abre con la opcion [7] de este menu (levanta el servidor solo
echo   si hace falta), o a mano en:
echo     !TUNER_URL!
echo.
echo   Corre esto DESPUES de:
echo     - tocar posiciones en component_defaults.js
echo     - agregar o borrar un .asy  (si no, el componente nuevo
echo       no aparece en el desplegable del tuner)
echo.
set "go="
set /p "go=  Regenerar ahora? (S/N): "
if /i not "!go!"=="S" goto menu
echo.
echo   Regenerando la seccion 9 de la especificacion...
call npm run spec
echo.
echo   Regenerando la lista de componentes del tuner...
call npm run components
echo.
pause
goto menu

:fin
popd
endlocal
exit /b 0
