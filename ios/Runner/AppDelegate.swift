import Flutter
import GoogleMobileAds
import ObjectiveC
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // SoLoud/audio_session owns the app's AVAudioSession. Prevent a rewarded
    // or interstitial video from changing the category underneath the native
    // game mixer and leaving iOS silent after dismissal.
    MobileAds.shared.audioVideoManager.isAudioSessionApplicationManaged = true
    suppressKeyboardInputAssistantBar()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  private func suppressKeyboardInputAssistantBar() {
    NotificationCenter.default.addObserver(
      forName: UIResponder.keyboardWillShowNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      // WKWebView creates its editable responder lazily. Run after the
      // keyboard notification so the newly focused HTML input is included.
      let delays: [TimeInterval] = [0, 0.05, 0.2, 0.5]
      for delay in delays {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
          self?.clearInputAssistantItems()
          self?.suppressWKContentViewAccessoryBar()
        }
      }
    }
  }

  private func clearInputAssistantItems() {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)

    for window in windows {
      clearInputAssistantItems(in: window)
    }
  }

  private func clearInputAssistantItems(in view: UIView) {
    view.inputAssistantItem.leadingBarButtonGroups = []
    view.inputAssistantItem.trailingBarButtonGroups = []

    for subview in view.subviews {
      clearInputAssistantItems(in: subview)
    }
  }

  // The "< > Done" bar with prev/next chevrons is WKWebView's own form
  // navigation accessory view, separate from inputAssistantItem above.
  // It's rendered by a private WKContentView subview and has no public
  // API to hide - the standard workaround is to dynamically subclass that
  // view so its inputAccessoryView getter returns nil.
  private func suppressWKContentViewAccessoryBar() {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)

    for window in windows {
      suppressWKContentViewAccessoryBar(in: window)
    }
  }

  private func suppressWKContentViewAccessoryBar(in view: UIView) {
    let typeName = String(describing: type(of: view))
    if typeName.hasPrefix("WKContent") && !typeName.hasSuffix("_NoInputAccessory") {
      removeAccessoryView(from: view)
    }
    for subview in view.subviews {
      suppressWKContentViewAccessoryBar(in: subview)
    }
  }

  private func removeAccessoryView(from view: UIView) {
    let noAccessoryClassName = "\(type(of: view))_NoInputAccessory"
    var noAccessoryClass: AnyClass? = NSClassFromString(noAccessoryClassName)

    if noAccessoryClass == nil {
      guard let existingClass = object_getClass(view) else { return }
      guard let newClass = objc_allocateClassPair(existingClass, noAccessoryClassName, 0) else { return }

      if let method = class_getInstanceMethod(EmptyAccessoryViewProvider.self, #selector(getter: EmptyAccessoryViewProvider.inputAccessoryView)) {
        class_addMethod(
          newClass,
          #selector(getter: UIResponder.inputAccessoryView),
          method_getImplementation(method),
          method_getTypeEncoding(method)
        )
      }
      objc_registerClassPair(newClass)
      noAccessoryClass = newClass
    }

    if let noAccessoryClass {
      object_setClass(view, noAccessoryClass)
      // The accessory may already have been created for the currently focused
      // HTML input. Force UIKit to ask the responder for its new accessory.
      view.reloadInputViews()
    }
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }
}

// Donor class purely so we can borrow a real `inputAccessoryView` getter
// implementation (returning nil) to graft onto the dynamically created
// WKContentView subclass above via class_addMethod.
private class EmptyAccessoryViewProvider: UIView {
  @objc override var inputAccessoryView: UIView? { nil }
}
