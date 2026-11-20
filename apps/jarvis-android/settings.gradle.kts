pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
    plugins {
        id("com.android.application") version "8.7.3"
        id("org.jetbrains.kotlin.android") version "2.0.21"
        id("org.jetbrains.kotlin.jvm") version "2.0.21"
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "jarvis-android"

include(":core")

// O módulo do app precisa do Android SDK. Sem ele (por exemplo, numa máquina
// só com Java), ainda dá para rodar os testes da lógica com `./gradlew :core:test`.
val temSdk = file("local.properties").exists() ||
    System.getenv("ANDROID_HOME") != null ||
    System.getenv("ANDROID_SDK_ROOT") != null
if (temSdk) include(":app")
