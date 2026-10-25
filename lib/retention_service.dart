import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:in_app_review/in_app_review.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

/// Native side of the game's retention loop (assets/game/retention.js).
///
/// The page posts `{type: "state", streak, playedToday, lang, review?}` on the
/// `FlutterRetention` channel. From that we schedule a gentle evening reminder
/// for the next 14 days (skipping today once a bed is done) and, once, ask
/// for an App Store review after the player has finished a few beds.
class RetentionService {
  RetentionService._();
  static final instance = RetentionService._();

  final _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false;
  bool _permissionAsked = false;
  static const _hour = 19;
  static const _days = 14;
  static const _baseId = 4100;

  static const _copy = <String, List<(String, String)>>{
    'en': [
      ('Your garden misses you 🌷', 'A new bed is waiting to bloom. It only takes a few minutes.'),
      ('Hidden words are sprouting 🌱', 'Come find them before the sun goes down.'),
      ('Time for a cozy round 🌸', 'One relaxing bed of Garden of Words before you sleep?'),
      ('A daily gift is waiting 🎁', 'Open your garden to claim today’s free hints.'),
      ('The moonlit garden is calm 🌙', 'Relax with a quiet word hunt tonight.'),
      ('Your flowers are thirsty 💧', 'Water them with a few found words.'),
      ('New words in the hedges 🍃', 'Can you spot them all today?'),
    ],
    'de': [
      ('Dein Garten vermisst dich 🌷', 'Ein neues Beet wartet aufs Blühen. Es dauert nur ein paar Minuten.'),
      ('Versteckte Wörter sprießen 🌱', 'Finde sie, bevor die Sonne untergeht.'),
      ('Zeit für eine gemütliche Runde 🌸', 'Ein entspanntes Beet vor dem Schlafen?'),
      ('Ein tägliches Geschenk wartet 🎁', 'Öffne deinen Garten und hol dir die Gratis-Tipps von heute.'),
      ('Der Mondgarten ist ruhig 🌙', 'Entspann dich heute Abend mit einer leisen Wortsuche.'),
      ('Deine Blumen haben Durst 💧', 'Gieß sie mit ein paar gefundenen Wörtern.'),
      ('Neue Wörter in den Hecken 🍃', 'Findest du heute alle?'),
    ],
    'tr': [
      ('Bahçen seni özledi 🌷', 'Yeni bir bölüm çiçek açmayı bekliyor. Sadece birkaç dakika sürer.'),
      ('Saklı kelimeler filizleniyor 🌱', 'Güneş batmadan gel, hepsini bul.'),
      ('Huzurlu bir tura ne dersin? 🌸', 'Uyumadan önce Garden of Words’te bir bölüm.'),
      ('Günlük hediyen seni bekliyor 🎁', 'Bahçeni aç, bugünün ücretsiz ipuçlarını al.'),
      ('Ay ışığındaki bahçe sakin 🌙', 'Bu akşam sessiz bir kelime avıyla rahatla.'),
      ('Çiçeklerin susadı 💧', 'Birkaç kelime bulup onları sula.'),
      ('Çalıların arasında yeni kelimeler 🍃', 'Bugün hepsini bulabilir misin?'),
    ],
  };

  static const _streakCopy = <String, (String, String)>{
    'en': ('Your {n}-day streak is at risk 🔥', 'Finish one bed today to keep it growing.'),
    'de': ('Deine {n}-Tage-Serie ist in Gefahr 🔥', 'Schließe heute ein Beet ab, damit sie weiterwächst.'),
    'tr': ('{n} günlük serin tehlikede 🔥', 'Serini büyütmeye devam etmek için bugün bir bölüm bitir.'),
  };

  Future<void> _init() async {
    if (_ready || kIsWeb) return;
    tzdata.initializeTimeZones();
    try {
      final info = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(info.identifier));
    } catch (_) {
      // Unknown zone: reminders stay in UTC, which only shifts their hour.
    }
    await _plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
    );
    _ready = true;
  }

  /// Handles one JSON message from the page. Never throws.
  Future<void> handle(String raw) async {
    try {
      final m = jsonDecode(raw);
      if (m is! Map || m['type'] != 'state') return;
      final streak = (m['streak'] as num?)?.toInt() ?? 0;
      final playedToday = m['playedToday'] == true;
      final lang = _copy.containsKey(m['lang']) ? m['lang'] as String : 'en';
      await _init();
      // Ask for notification permission after the first finished bed, never at launch.
      if (playedToday && !_permissionAsked) {
        _permissionAsked = true;
        await _plugin
            .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
            ?.requestPermissions(alert: true, badge: false, sound: true);
        await _plugin
            .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
            ?.requestNotificationsPermission();
      }
      await _schedule(streak: streak, playedToday: playedToday, lang: lang);
      if (m['review'] == true) {
        final review = InAppReview.instance;
        if (await review.isAvailable()) await review.requestReview();
      }
    } catch (error) {
      debugPrint('Retention message failed: $error');
    }
  }

  Future<void> _schedule({required int streak, required bool playedToday, required String lang}) async {
    for (var i = 0; i < _days; i++) {
      await _plugin.cancel(id: _baseId + i);
    }
    final now = tz.TZDateTime.now(tz.local);
    final messages = _copy[lang]!;
    const details = NotificationDetails(
      android: AndroidNotificationDetails('daily_garden', 'Daily garden', importance: Importance.defaultImportance),
      iOS: DarwinNotificationDetails(),
    );
    for (var d = 0; d < _days; d++) {
      final at = tz.TZDateTime(tz.local, now.year, now.month, now.day + d, _hour);
      if (!at.isAfter(now)) continue;
      if (d == 0 && playedToday) continue;
      // "At risk" is only true for today (not yet played) or tomorrow (played today).
      final atRisk = streak > 0 && ((d == 0 && !playedToday) || (d == 1 && playedToday));
      final (title, body) = atRisk ? _streakCopy[lang]! : messages[(at.day + d) % messages.length];
      await _plugin.zonedSchedule(
        id: _baseId + d,
        scheduledDate: at,
        notificationDetails: details,
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
        title: title.replaceAll('{n}', '$streak'),
        body: body,
      );
    }
  }
}
