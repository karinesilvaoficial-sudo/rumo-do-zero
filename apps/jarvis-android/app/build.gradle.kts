import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "br.jarvis.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "br.jarvis.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
        ndk {
            // Celulares atuais (64 bits) e antigos (32 bits); deixa de fora emuladores x86.
            abiFilters += listOf("arm64-v8a", "armeabi-v7a")
        }
    }

    signingConfigs {
        // Chave fixa, só para o APK de instalação direta: assim uma versão nova
        // instala por cima da antiga. Não é segredo e não serve para publicar na loja.
        getByName("debug") {
            storeFile = file("jarvis.keystore")
            storePassword = "jarvis-debug"
            keyAlias = "jarvis"
            keyPassword = "jarvis-debug"
        }
    }

    packaging {
        resources {
            // Arquivos de licença repetidos nas bibliotecas; sem isto o empacotamento acusa duplicidade.
            excludes += setOf(
                "META-INF/DEPENDENCIES", "META-INF/INDEX.LIST",
                "META-INF/LICENSE*", "META-INF/NOTICE*", "META-INF/{AL2.0,LGPL2.1}",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(project(":core"))
    implementation("net.java.dev.jna:jna:5.13.0@aar")
    implementation("com.alphacephei:vosk-android:0.3.47@aar")
    implementation("com.anthropic:anthropic-java:3.3.0")
}
