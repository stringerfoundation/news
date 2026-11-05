#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 5 ]]; then
  echo "Usage: $0 APK VERSION_CODE SOURCE_COMMIT SOURCE_RUN_ID OUTPUT_DIR" >&2
  exit 2
fi

apk="$1"
version_code="$2"
source_commit="$3"
source_run_id="$4"
output_dir="$5"

[[ "$version_code" =~ ^[1-9][0-9]*$ ]] || { echo 'VERSION_CODE must be a positive integer.' >&2; exit 2; }
[[ "$source_commit" =~ ^[0-9a-f]{40}$ ]] || { echo 'SOURCE_COMMIT must be a 40-character lowercase Git SHA.' >&2; exit 2; }
[[ "$source_run_id" =~ ^[0-9]+$ ]] || { echo 'SOURCE_RUN_ID must be numeric.' >&2; exit 2; }
[[ -s "$apk" ]] || { echo "APK is missing or empty: $apk" >&2; exit 1; }
apksigner_command="$(command -v apksigner || true)"
android_build_tools="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}/build-tools"
if [[ -z "$apksigner_command" && -d "$android_build_tools" ]]; then
  while IFS= read -r candidate; do
    apksigner_command="$candidate"
  done < <(find "$android_build_tools" -type f -name apksigner -print | sort -V)
fi
[[ -n "$apksigner_command" ]] || { echo 'apksigner is required to verify and identify the APK signer.' >&2; exit 1; }
aapt_command="$(command -v aapt || true)"
if [[ -z "$aapt_command" && -d "$android_build_tools" ]]; then
  while IFS= read -r candidate; do
    aapt_command="$candidate"
  done < <(find "$android_build_tools" -type f -name aapt -print | sort -V)
fi
[[ -n "$aapt_command" ]] || { echo 'aapt is required to verify the APK package and version.' >&2; exit 1; }

verification="$("$apksigner_command" verify --verbose --print-certs "$apk")" || {
  echo 'apksigner signature verification failed.' >&2
  exit 1
}
certificate_sha256="$(printf '%s\n' "$verification" | awk -F ': ' '/certificate SHA-256 digest:/ { print $2; exit }')"
[[ "$certificate_sha256" =~ ^[[:xdigit:]]{64}$ ]] || {
  echo 'Unable to read the verified APK signer certificate SHA-256 fingerprint.' >&2
  exit 1
}
package_line="$("$aapt_command" dump badging "$apk" | awk '/^package: / { print; exit }')"
IFS='|' read -r actual_package actual_version_code actual_version_name <<< "$(printf '%s\n' "$package_line" | awk -F "'" '/^package: / { print $2 "|" $4 "|" $6 }')"
[[ "$actual_package" == org.stringerjournalism.news ]] || { echo 'APK package ID does not match org.stringerjournalism.news.' >&2; exit 1; }
[[ "$actual_version_code" == "$version_code" ]] || { echo 'APK versionCode does not match the release run number.' >&2; exit 1; }
[[ "$actual_version_name" == "0.1.$version_code" ]] || { echo 'APK versionName does not match the release version.' >&2; exit 1; }

mkdir -p "$output_dir"
apk_sha256="$(sha256sum "$apk" | cut -d ' ' -f 1)"
printf '%s  app-release.apk\n' "$apk_sha256" > "$output_dir/app-release.apk.sha256"
cat > "$output_dir/android-release-provenance.txt" <<EOF
Application ID: org.stringerjournalism.news
Version: 0.1.$version_code
Version code: $version_code
Source commit: $source_commit
Android CI run ID: $source_run_id
APK SHA-256: $apk_sha256
APK signer certificate SHA-256: $certificate_sha256
EOF
