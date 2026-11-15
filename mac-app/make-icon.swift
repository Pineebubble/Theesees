// Draws the Theesees app icon: the twelve folder colours as stripes side by side, with a white pen in the
// middle. Transparent outside the rounded square.   swift mac-app/make-icon.swift out.png
import AppKit

let colours = [0xff6a4a, 0x3fae6a, 0xc8b5f0, 0xf6e04a, 0xffa53d, 0x5fb0e8, 0x3fc1ad, 0xff97b0, 0xb9ec70, 0xdccca6, 0xd0a43a, 0xdddcd6]
let size = 1024
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4,
                           hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let g = NSGraphicsContext.current!.cgContext
g.clear(CGRect(x: 0, y: 0, width: size, height: size))

// The rounded square macOS icons use: 824 points wide on a 1024 canvas.
let box = CGRect(x: 100, y: 100, width: 824, height: 824)
g.saveGState()
g.addPath(CGPath(roundedRect: box, cornerWidth: 186, cornerHeight: 186, transform: nil))
g.clip()
let w = box.width / CGFloat(colours.count)
for (i, c) in colours.enumerated() {
    g.setFillColor(CGColor(red: CGFloat((c >> 16) & 255) / 255, green: CGFloat((c >> 8) & 255) / 255, blue: CGFloat(c & 255) / 255, alpha: 1))
    g.fill(CGRect(x: box.minX + CGFloat(i) * w - 0.5, y: box.minY, width: w + 1, height: box.height))
}

// The pen, drawn pointing down and then tilted: a slim barrel with a rounded end, a thin gap, and the tip.
let tilt = CGAffineTransform(translationX: 512, y: 512).rotated(by: -.pi / 4)
let half: CGFloat = 50
let pen = CGMutablePath()
pen.move(to: CGPoint(x: -half, y: -118), transform: tilt); pen.addLine(to: CGPoint(x: half, y: -118), transform: tilt)
pen.addLine(to: CGPoint(x: half, y: 262), transform: tilt)
pen.addArc(tangent1End: CGPoint(x: half, y: 302), tangent2End: CGPoint(x: 0, y: 302), radius: 40, transform: tilt)
pen.addArc(tangent1End: CGPoint(x: -half, y: 302), tangent2End: CGPoint(x: -half, y: 262), radius: 40, transform: tilt)
pen.closeSubpath()
pen.move(to: CGPoint(x: -half, y: -150), transform: tilt); pen.addLine(to: CGPoint(x: half, y: -150), transform: tilt)
pen.addLine(to: CGPoint(x: 9, y: -282), transform: tilt)
pen.addQuadCurve(to: CGPoint(x: -9, y: -282), control: CGPoint(x: 0, y: -304), transform: tilt)
pen.closeSubpath()
g.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
g.addPath(pen); g.fillPath()
// A soft inner shadow: just inside the pen's edge, a faint tint of the stripe behind it.
let outside = CGMutablePath()
outside.addRect(CGRect(x: -200, y: -200, width: 1424, height: 1424)); outside.addPath(pen)
for (i, c) in colours.enumerated() {
    g.saveGState()
    g.addPath(pen); g.clip()
    g.clip(to: CGRect(x: box.minX + CGFloat(i) * w, y: box.minY, width: w, height: box.height))
    g.setShadow(offset: .zero, blur: 11, color: CGColor(red: CGFloat((c >> 16) & 255) / 255, green: CGFloat((c >> 8) & 255) / 255, blue: CGFloat(c & 255) / 255, alpha: 0.42))
    g.addPath(outside); g.fillPath(using: .evenOdd)
    g.restoreGState()
}
g.restoreGState()

try! (rep.retagging(with: .sRGB) ?? rep).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
