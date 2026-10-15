!/bin/bash

set -e

echo "Cleaning generated Android build files..."

cd android

echo "Building Release APK..."

./gradlew.bat assembleRelease --no-daemon

echo "APK Generated Successfully"
echo "Location:"
echo "app/build/outputs/apk/release/app-release.apk"


# ///////////// iOS Build //////////////////////


# echo ""
# echo "Building iOS using EAS..."

# eas build --platform ios --profile preview

# echo ""
# echo "iOS Build Completed Successfully"
# echo "Download the iOS build from the EAS build page."
# /////////////Development Build//////////////////////


# !/bin/bash

# set -e

# echo "Cleaning project..."
# cd android

# echo "Building Debug APK..."
# ./gradlew assembleDebug

# echo "Debug APK Generated Successfully"

# echo "Location:"
# echo "app/build/outputs/apk/debug/app-debug.apk"