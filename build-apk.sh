#!/bin/bash

set -e

echo "Cleaning project..."
cd android

./gradlew.bat clean --no-daemon

echo "Building APK..."
./gradlew.bat assembleRelease --no-daemon

echo "APK Generated Successfully"
echo "app/build/outputs/apk/release/app-release.apk"

# /////////////Development Build//////////////////////


# !/bin/bash

# set -e

# echo "Cleaning project..."
# cd android
# ./gradlew clean

# echo "Building Debug APK..."
# ./gradlew assembleDebug

# echo "Debug APK Generated Successfully"

# echo "Location:"
# echo "app/build/outputs/apk/debug/app-debug.apk"