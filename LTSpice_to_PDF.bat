@echo off
setlocal EnableExtensions EnableDelayedExpansion
title LTSpice to PDF - Herramientas

REM Trabajar siempre en la carpeta del repo, sin importar desde donde se clickee.
pushd "%~dp0"

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
if /i "!opt!"=="Q" goto fin
goto menu

:serve
cls
echo.
echo   Levantando el servidor y abriendo el navegador...
echo   Se abre en una ventana aparte: cerrala para detener el servidor.
echo.
echo   Con el servidor andando tambien podes abrir el Window Tuner en:
echo     http://localhost:8000/tools/dev_window_tuner.html
echo.
REM Ventana propia para que el servidor siga vivo y este menu quede libre.
start "LTSpice to PDF - servidor" cmd /k node "%~dp0tools\serve.js"
timeout /t 2 >nul
goto menu

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
echo   Se abre con el servidor andando (opcion [1]), en:
echo     http://localhost:8000/tools/dev_window_tuner.html
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
