// Theesees as a Mac app: one window showing the app, with no browser involved. It starts Theesees's local
// server (theesees-server.py) if it is not running, so the workspace is the same one every browser on this
// Mac opens at http://127.0.0.1:8765/. Built and installed by mac-app/install.sh.
import Cocoa
import WebKit

let env = ProcessInfo.processInfo.environment
let info = Bundle.main.infoDictionary ?? [:]
let port = Int(env["THEESEES_PORT"] ?? "") ?? 8765
let home = URL(string: "http://127.0.0.1:\(port)/")!
let repo = info["TheeseesRepo"] as? String ?? ""
let python = info["TheeseesPython"] as? String ?? "/usr/bin/python3"
let selfTest = env["THEESEES_SELFTEST"] != nil

func isLocal(_ url: URL?) -> Bool {
    guard let url = url else { return false }
    if ["about", "blob", "data"].contains(url.scheme ?? "") { return true }
    return ["127.0.0.1", "localhost"].contains(url.host ?? "") && (url.port ?? 80) == port
}

/// Makes sure Theesees's server is running, with the script install.sh put inside the app (start-server.sh).
/// It is left running after this window closes, so browsers keep working. Returns nil, or what went wrong.
func startServer() -> String? {
    guard let script = Bundle.main.path(forResource: "start-server", ofType: "sh") else {
        return "The app is incomplete. Run mac-app/install.sh again."
    }
    let p = Process(), out = Pipe()
    p.executableURL = URL(fileURLWithPath: "/bin/zsh")
    p.arguments = [script, repo, python, String(port)]
    p.standardOutput = out
    do { try p.run() } catch { return error.localizedDescription }
    let said = String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    p.waitUntilExit()
    return p.terminationStatus == 0 ? nil : said.trimmingCharacters(in: .whitespacesAndNewlines)
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var saved: [ObjectIdentifier: URL] = [:]

    func applicationDidFinishLaunching(_ note: Notification) {
        let config = WKWebViewConfiguration()
        config.preferences.isElementFullscreenEnabled = true
        config.applicationNameForUserAgent = "Version/18.0 Safari/605.1.15 TheeseesApp/1.0" // the page names this window in “saved by…”
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsMagnification = true
        if #available(macOS 13.3, *) { web.isInspectable = true }

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 860),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Theesees"
        window.minSize = NSSize(width: 720, height: 480)
        window.contentView = web
        window.center()
        window.setFrameAutosaveName("TheeseesMain")
        window.tabbingMode = .disallowed
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        buildMenu()

        DispatchQueue.global().async {
            let problem = startServer()
            DispatchQueue.main.async {
                if let problem = problem {
                    if selfTest { selfTestFailed("server: \(problem)") }
                    let a = NSAlert(); a.messageText = "Theesees could not start"; a.informativeText = problem; a.runModal()
                    NSApp.terminate(nil)
                } else {
                    self.web.load(URLRequest(url: home))
                }
            }
        }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // --- Menus (also what makes ⌘C, ⌘V, ⌘Z… work in the page) ---
    func buildMenu() {
        let main = NSMenu()
        func menu(_ title: String, _ items: [NSMenuItem]) {
            let m = NSMenu(title: title); items.forEach { m.addItem($0) }
            let top = NSMenuItem(); top.submenu = m; main.addItem(top)
        }
        func item(_ title: String, _ action: Selector?, _ key: String = "", _ mods: NSEvent.ModifierFlags = .command, target: AnyObject? = nil) -> NSMenuItem {
            let i = NSMenuItem(title: title, action: action, keyEquivalent: key); i.keyEquivalentModifierMask = mods; i.target = target; return i
        }
        menu("Theesees", [
            item("About Theesees", #selector(NSApplication.orderFrontStandardAboutPanel(_:))), .separator(),
            item("Open the Workspace Folder", #selector(showFolder), target: self), .separator(),
            item("Hide Theesees", #selector(NSApplication.hide(_:)), "h"),
            item("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]), .separator(),
            item("Quit Theesees", #selector(NSApplication.terminate(_:)), "q")])
        menu("Edit", [
            item("Undo", Selector(("undo:")), "z"), item("Redo", Selector(("redo:")), "z", [.command, .shift]), .separator(),
            item("Cut", #selector(NSText.cut(_:)), "x"), item("Copy", #selector(NSText.copy(_:)), "c"),
            item("Paste", #selector(NSText.paste(_:)), "v"),
            item("Paste and Match Style", #selector(NSTextView.pasteAsPlainText(_:)), "v", [.command, .option, .shift]),
            item("Select All", #selector(NSText.selectAll(_:)), "a")])
        menu("View", [
            item("Reload", #selector(reload), "r", target: self), .separator(),
            item("Actual Size", #selector(zoomReset), "0", target: self),
            item("Zoom In", #selector(zoomIn), "+", target: self), item("Zoom Out", #selector(zoomOut), "-", target: self), .separator(),
            item("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control])])
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"))
        windowMenu.addItem(item("Close", #selector(NSWindow.performClose(_:)), "w"))
        let top = NSMenuItem(); top.submenu = windowMenu; main.addItem(top)
        NSApp.mainMenu = main
        NSApp.windowsMenu = windowMenu
    }
    @objc func reload() { if web.url == nil { web.load(URLRequest(url: home)) } else { web.reload() } }
    @objc func zoomIn() { web.pageZoom = min(web.pageZoom + 0.1, 3) ; UserDefaults.standard.set(Double(web.pageZoom), forKey: "zoom") }
    @objc func zoomOut() { web.pageZoom = max(web.pageZoom - 0.1, 0.5); UserDefaults.standard.set(Double(web.pageZoom), forKey: "zoom") }
    @objc func zoomReset() { web.pageZoom = 1; UserDefaults.standard.set(1.0, forKey: "zoom") }
    @objc func showFolder() {
        URLSession.shared.dataTask(with: home.appendingPathComponent("_store/")) { data, _, _ in
            guard let data = data, let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let path = j["path"] as? String else { return }
            DispatchQueue.main.async { NSWorkspace.shared.open(URL(fileURLWithPath: NSString(string: path).expandingTildeInPath)) }
        }.resume()
    }

    // --- Pages: Theesees stays in the window, other websites open in the browser ---
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.shouldPerformDownload { return decisionHandler(.download) }
        if let url = action.request.url, !isLocal(url), action.targetFrame?.isMainFrame ?? true {
            NSWorkspace.shared.open(url); return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { if isLocal(url) { webView.load(action.request) } else { NSWorkspace.shared.open(url) } }
        return nil
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let zoom = UserDefaults.standard.double(forKey: "zoom"); if zoom >= 0.5 { webView.pageZoom = zoom }
        if selfTest { runSelfTest() }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if selfTest { selfTestFailed("load: \(error.localizedDescription)") }
        if (error as NSError).code == NSURLErrorCancelled { return }
        // The server may have been stopped since the window opened: start it and try once more.
        DispatchQueue.global().async {
            let problem = startServer()
            DispatchQueue.main.async {
                if let problem = problem { let a = NSAlert(); a.messageText = "Theesees is not answering"; a.informativeText = problem; a.runModal() }
                else { webView.load(URLRequest(url: home)) }
            }
        }
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    // --- Things a browser would do for the page ---
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        panel.beginSheetModal(for: window) { completionHandler($0 == .OK ? panel.urls : nil) }
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = message; a.beginSheetModal(for: window) { _ in completionHandler() }
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = message; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        a.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) }
    }

    // --- Downloads (backups, exports, pictures) go to the Downloads folder, as in a browser ---
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let folder = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first ?? URL(fileURLWithPath: NSHomeDirectory())
        let name = suggestedFilename.replacingOccurrences(of: "/", with: "-")
        let base = (name as NSString).deletingPathExtension, ext = (name as NSString).pathExtension
        var url = folder.appendingPathComponent(name), n = 2
        while FileManager.default.fileExists(atPath: url.path) {
            url = folder.appendingPathComponent(ext.isEmpty ? "\(base) \(n)" : "\(base) \(n).\(ext)"); n += 1
        }
        saved[ObjectIdentifier(download)] = url
        completionHandler(url)
    }
    func downloadDidFinish(_ download: WKDownload) {
        guard let url = saved.removeValue(forKey: ObjectIdentifier(download)) else { return }
        if selfTest { print("SELFTEST saved \(url.lastPathComponent)") }
        DistributedNotificationCenter.default().post(name: Notification.Name("com.apple.DownloadFileFinished"), object: url.path) // bounces the Dock's Downloads
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        saved.removeValue(forKey: ObjectIdentifier(download))
        let a = NSAlert(); a.messageText = "The file could not be saved to Downloads"; a.informativeText = error.localizedDescription; a.beginSheetModal(for: window)
    }
}

// --- Self-test, for checking a build without clicking through it ---
// THEESEES_SELFTEST=1 opens the app, prints one line about what the page can do, and quits. Any other value
// is JavaScript to run in the page instead (it may await; what it returns is printed). Use it with
// THEESEES_PORT and THEESEES_STORE so the real workspace is not touched.
extension AppDelegate {
    func runSelfTest() {
        let basics = "return JSON.stringify({title:document.title,state:syncState,server:syncOnServer(),secure:isSecureContext,clipboard:!!navigator.clipboard,idb:!!window.indexedDB,papers:data.papers.length,pdfjs:typeof pdfjsLib})"
        let asked = env["THEESEES_SELFTEST"] ?? "1"
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { // give the page time to start and sync
            self.web.callAsyncJavaScript(asked == "1" ? basics : asked, arguments: [:], in: nil, in: .page) { result in
                switch result {
                case .success(let value): print("SELFTEST \(value)"); exit(0)
                case .failure(let error): selfTestFailed("\(error)")
                }
            }
        }
    }
}
func selfTestFailed(_ why: String) -> Never { print("SELFTEST failed: \(why)"); exit(1) }

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
