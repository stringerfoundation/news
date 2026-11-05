#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../android"

# Keep installations in place between phases: Gradle's instrumentation task can
# reinstall/uninstall its target, which would invalidate an upgrade-data test.
ANDROID_VERSION_CODE=1 ./gradlew --no-daemon :app:assembleDebug :app:assembleDebugAndroidTest
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk

run_test() {
  local result
  result="$(adb shell am instrument -w -e class "$1" org.stringerjournalism.news.debug.test/androidx.test.runner.AndroidJUnitRunner)"
  printf '%s\n' "$result"
  # `am instrument` may return zero even when a test failed or crashed.
  printf '%s\n' "$result" | grep -Eq '^OK \([1-9][0-9]* tests?\)'
}

run_test org.stringerjournalism.news.ReaderSmokeTest
run_test 'org.stringerjournalism.news.UpgradePersistenceTest#seed'
ANDROID_VERSION_CODE=2 ./gradlew --no-daemon :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell dumpsys package org.stringerjournalism.news.debug | grep -E 'versionCode=2([[:space:]]|$)'
run_test 'org.stringerjournalism.news.UpgradePersistenceTest#verify'
