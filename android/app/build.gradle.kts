plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val isReleaseRequested = gradle.startParameter.taskNames.any { it.contains("release", ignoreCase = true) }
fun releaseValue(name: String): String {
    val value = providers.environmentVariable(name).orNull
    if (isReleaseRequested && value.isNullOrBlank()) error("$name must be set to build a signed release")
    return value.orEmpty()
}
val versionCodeRaw = providers.environmentVariable("ANDROID_VERSION_CODE").orNull
val versionCodeValue = versionCodeRaw?.toIntOrNull()
    ?: if (isReleaseRequested) error("ANDROID_VERSION_CODE must be set to build a release") else 1
if (isReleaseRequested && (versionCodeValue !in 1..2_100_000_000 || versionCodeRaw != versionCodeValue.toString())) {
    error("ANDROID_VERSION_CODE must be a decimal integer from 1 through 2100000000")
}

android {
    namespace = "org.stringerjournalism.news"
    compileSdk = 35

    sourceSets.getByName("androidTest").assets.srcDir("../core/src/test/resources")

    defaultConfig {
        applicationId = "org.stringerjournalism.news"
        minSdk = 26
        targetSdk = 35
        versionCode = versionCodeValue
        versionName = "0.1.$versionCodeValue"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            val keystorePath = releaseValue("ANDROID_KEYSTORE_PATH")
            if (keystorePath.isNotBlank()) storeFile = file(keystorePath)
            storePassword = releaseValue("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = releaseValue("ANDROID_KEY_ALIAS")
            keyPassword = releaseValue("ANDROID_KEY_PASSWORD")
        }
    }

    buildTypes {
        debug { applicationIdSuffix = ".debug"; versionNameSuffix = "-debug" }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = true }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

dependencies {
    implementation(project(":core"))
    implementation(platform("androidx.compose:compose-bom:2025.03.00"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.datastore:datastore-preferences:1.1.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1")
    implementation("fr.acinq.secp256k1:secp256k1-kmp-jni-android:0.23.0")
    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.test.espresso:espresso-intents:3.6.1")
    androidTestImplementation(platform("androidx.compose:compose-bom:2025.03.00"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
