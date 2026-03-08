@echo off
echo ============================================
echo Starting MCDA Decision Intelligence
echo ============================================
echo.

docker-compose up -d --build

echo.
echo ============================================
echo MCDA is starting...
echo.
echo Open in your browser:
echo http://localhost:8888
echo ============================================
echo.
echo Showing container logs (Ctrl+C to exit)...
echo.

docker-compose logs -f
