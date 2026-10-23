# R8/AGP 9 compatibility for Google Mobile Ads -> WorkManager -> Room.
# WorkDatabase is created reflectively during androidx.startup initialization.
-keep class androidx.work.impl.** { *; }
-keep class androidx.work.WorkManagerInitializer { *; }
-keep class androidx.room.RoomDatabase { *; }
-keep class * extends androidx.room.RoomDatabase { *; }
-keep class androidx.room.** { *; }
-keep class androidx.startup.** { *; }

# Google Mobile Ads classes used through reflection.
-keep public class com.google.android.gms.ads.** { public *; }

# Keep required runtime annotations/attributes.
-keepattributes *Annotation*
-keepattributes Signature
