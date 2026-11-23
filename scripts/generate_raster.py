import os
import subprocess
from PIL import Image

edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
html_path = r"C:\Users\User\.gemini\antigravity\scratch\agentverse\temp_visual.html"
png_output = r"C:\Users\User\.gemini\antigravity\scratch\agentverse\data\pranav-signal-revops.png"
jpg_output = r"C:\Users\User\.gemini\antigravity\scratch\agentverse\data\pranav-signal-revops.jpg"
downloads_jpg = r"C:\Users\User\Downloads\pranav-signal-revops.jpg"
downloads_png = r"C:\Users\User\Downloads\pranav-signal-revops.png"

# Edge command
cmd = [
    edge_path,
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--window-size=1200,627",
    f"--screenshot={png_output}",
    f"file:///{html_path.replace(os.sep, '/')}"
]

print("Running command:", " ".join(cmd))
res = subprocess.run(cmd, capture_output=True, text=True)
print("Return code:", res.returncode)

if os.path.exists(png_output):
    im = Image.open(png_output)
    print("Rendered PNG dimensions:", im.size)
    # If the window has chrome or default size, crop/resize to exact 1200x627
    if im.size != (1200, 627):
        im = im.resize((1200, 627), Image.Resampling.LANCZOS)
        im.save(png_output, "PNG")
        print("Resized to exact (1200, 627)")
    
    # Save as high-quality JPEG
    rgb_im = im.convert("RGB")
    rgb_im.save(jpg_output, "JPEG", quality=95)
    print(f"Saved JPEG to {jpg_output} (Size: {os.path.getsize(jpg_output)} bytes)")
    
    # Also copy to Downloads folder
    rgb_im.save(downloads_jpg, "JPEG", quality=95)
    im.save(downloads_png, "PNG")
    print(f"Copied to {downloads_jpg} and {downloads_png}")

    # Check if 'Linkdin Images' exists in user directory
    linkedin_folder = r"C:\Users\User\Pictures\Linkdin Images"
    if os.path.exists(linkedin_folder):
        rgb_im.save(os.path.join(linkedin_folder, "pranav-signal-revops.jpg"), "JPEG", quality=95)
        print(f"Copied to {linkedin_folder}")
else:
    print("PNG output not created!")
