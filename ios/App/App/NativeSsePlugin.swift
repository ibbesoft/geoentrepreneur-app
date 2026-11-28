import Foundation
import Capacitor

@objc(NativeSsePlugin)
public class NativeSsePlugin: CAPPlugin, URLSessionDataDelegate {
    private var url: URL?
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var buffer = ""
    private var eventType = "message"

    @objc func configure(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let url = URL(string: urlString) else {
            call.reject("Invalid SSE URL")
            return
        }
        closeTask()
        self.url = url
        self.session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
        call.resolve()
    }

    @objc func open(_ call: CAPPluginCall) {
        guard let url = url, let session = session else {
            call.reject("SSE plugin is not configured")
            return
        }

        closeTask()
        buffer = ""
        var request = URLRequest(url: url)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        task = session.dataTask(with: request)
        task?.resume()
        call.resolve()
    }

    @objc func close(_ call: CAPPluginCall) {
        closeTask()
        session?.invalidateAndCancel()
        session = nil
        call.resolve()
    }

    private func closeTask() {
        task?.cancel()
        task = nil
    }

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        if let httpResponse = response as? HTTPURLResponse, !(200...299).contains(httpResponse.statusCode) {
            notifyListeners("error", data: ["error": "HTTP \(httpResponse.statusCode)"])
            completionHandler(.cancel)
            return
        }
        notifyListeners("open", data: [:])
        completionHandler(.allow)
    }

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let chunk = String(data: data, encoding: .utf8) else {
            return
        }
        buffer += chunk

        while let separator = buffer.range(of: "\n\n") {
            let block = String(buffer[..<separator.lowerBound])
            buffer = String(buffer[separator.upperBound...])
            processBlock(block)
        }
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            notifyListeners("error", data: ["error": error.localizedDescription])
        }
    }

    private func processBlock(_ block: String) {
        var dataLines: [String] = []
        eventType = "message"

        for line in block.components(separatedBy: "\n") {
            if line.hasPrefix("event:") {
                eventType = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                dataLines.append(String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces))
            }
        }

        guard !dataLines.isEmpty, eventType == "assignment_read_model_updated" else {
            return
        }

        notifyListeners("message", data: [
            "type": eventType,
            "message": dataLines.joined(separator: "\n")
        ])
    }
}
