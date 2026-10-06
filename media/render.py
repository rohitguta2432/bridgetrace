"""Render a silent 15-second square product film from actual dashboard captures.

Requires Python + Pillow and ffmpeg. Captures live in media/source/.
Run: python3 media/render.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import math
import subprocess

ROOT = Path(__file__).resolve().parent
SIZE, FPS, DURATION = 1080, 30, 15
CYAN, WHITE, MUTED = '#85d6e2', '#eff3fa', '#a8b4c8'
FONT_DIR = Path('/System/Library/Fonts/Supplemental')
if FONT_DIR.exists():
    REGULAR, BOLD = FONT_DIR / 'Arial.ttf', FONT_DIR / 'Arial Bold.ttf'
else:
    FONT_DIR = Path('/usr/share/fonts/truetype/dejavu')
    REGULAR, BOLD = FONT_DIR / 'DejaVuSans.ttf', FONT_DIR / 'DejaVuSans-Bold.ttf'

def font(size, bold=False):
    return ImageFont.truetype(str(BOLD if bold else REGULAR), size)

fonts = {s: font(s) for s in (21, 24, 26, 28, 30, 32)}
bolds = {s: font(s, True) for s in (24, 32, 40, 46, 48, 56, 68, 80, 88)}
base = Image.new('RGB', (SIZE, SIZE))
pix = base.load()
for y in range(SIZE):
    for x in range(SIZE):
        glow = max(0, 1-math.hypot((x-870)/950, (y-100)/1050))
        pix[x, y] = (int(8+glow*8), int(15+glow*17), int(27+glow*22))

shots = {key: Image.open(ROOT/'source'/f'{key}.jpg').convert('RGB') for key in ('pending','completed','evidence')}
cuts = [0, 2.7, 6.7, 9.7, 12.3, 15]

def label(draw, text, x, y, size=26, color=MUTED, bold=False):
    draw.text((x,y), text, font=bolds[size] if bold else fonts[size], fill=color)

def screenshot(frame, key, crop, y, progress):
    width = round(936+12*progress)
    shot = shots[key].crop(crop)
    height = round(shot.height*width/shot.width)
    shot = shot.resize((width,height), Image.Resampling.LANCZOS)
    mask = Image.new('L',(width,height),0)
    ImageDraw.Draw(mask).rounded_rectangle((0,0,width-1,height-1),radius=18,fill=255)
    x = (SIZE-width)//2
    frame.paste(shot,(x,y),mask)
    ImageDraw.Draw(frame).rounded_rectangle((x,y,x+width,y+height),radius=18,outline='#344457',width=2)

def scene(index, progress, time):
    frame = base.copy()
    d = ImageDraw.Draw(frame)
    d.rounded_rectangle((64,60,122,118),radius=15,fill='#17313d',outline='#38616d',width=2)
    d.line((78,79,109,79),fill=CYAN,width=3)
    d.line((102,73,109,79,102,85),fill=CYAN,width=3)
    d.line((108,99,77,99),fill=CYAN,width=3)
    d.line((84,93,77,99,84,105),fill=CYAN,width=3)
    label(d,'BridgeTrace',140,69,40,WHITE,True)
    label(d,'CCTP V2',882,80,24,CYAN)
    if index == 0:
        label(d,'FOLLOW THE EVIDENCE',64,235,24,CYAN)
        label(d,'Where did your',64,304,80,WHITE,True)
        label(d,'USDC stop?',64,402,88,CYAN,True)
        label(d,'Trace the burn, attestation, and receipt.',64,543,32,MUTED)
        steps = [('01','Burn'),('02','Attestation'),('03','Receipt')]
        for i,(number,title) in enumerate(steps):
            x=64+i*328
            d.rounded_rectangle((x,663,x+295,815),radius=18,fill='#111d2d',outline='#314359',width=2)
            label(d,number,x+26,687,24,CYAN)
            label(d,title,x+26,736,32,WHITE,True)
            if i<2:
                d.line((x+303,738,x+319,738),fill=CYAN,width=3)
        label(d,'Ethereum ↔ Base · Mainnet + Sepolia',64,890,28,MUTED)
    elif index in (1,2):
        title = 'Attested. Receipt pending.' if index==1 else 'See proof of destination receipt.'
        label(d,title,64,185,48,WHITE,True)
        label(d,'A ready attestation does not mean delivery.' if index==1 else 'Each stage is backed by observable evidence.',64,259,28,CYAN)
        screenshot(frame,'pending' if index==1 else 'completed',(440,257,1332,815),334,progress)
        d=ImageDraw.Draw(frame)
        label(d,'ILLUSTRATIVE SAMPLE',64,947,21,MUTED)
    elif index == 3:
        label(d,'Take the evidence with you.',64,185,48,WHITE,True)
        label(d,'Inspect the details. Export a support report.',64,259,28,CYAN)
        screenshot(frame,'evidence',(440,966,1332,1310),383,progress)
        d=ImageDraw.Draw(frame)
        for x,text in [(64,'Source hash'),(374,'Message nonce'),(727,'JSON export')]:
            d.rounded_rectangle((x,828,x+283,898),radius=14,fill='#16313c',outline='#356573',width=1)
            label(d,text,x+22,848,26,CYAN)
        label(d,'ILLUSTRATIVE SAMPLE',64,947,21,MUTED)
    else:
        label(d,'BridgeTrace',64,297,88,WHITE,True)
        label(d,'Evidence before assumptions.',64,414,40,CYAN,True)
        label(d,'Read-only. No wallet connection.',64,509,32,MUTED)
        d.rounded_rectangle((64,639,1016,748),radius=18,fill='#193c47',outline='#67b7c5',width=2)
        label(d,'github.com/rohitguta2432/bridgetrace',94,674,32,WHITE)
        label(d,'Open source · Try the demo via the launch post',64,818,28,CYAN)
    # A consistent footer keeps sample disclosure visible even during transitions.
    d=ImageDraw.Draw(frame)
    d.line((64,997,1016,997),fill='#2b3b50',width=1)
    label(d,'SIMULATED PRODUCT WALKTHROUGH',64,1020,21,MUTED)
    label(d,'Built by Rohit Raj',824,1020,21,MUTED)
    d.rectangle((0,1075,round(SIZE*time/DURATION),1079),fill=CYAN)
    return frame

command=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{SIZE}x{SIZE}','-framerate',str(FPS),'-i','-','-an','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-metadata','title=BridgeTrace — 15-second product walkthrough',str(ROOT/'bridgetrace-15s.mp4')]
process=subprocess.Popen(command,stdin=subprocess.PIPE)
for number in range(FPS*DURATION):
    t=number/FPS
    index=next(i for i in range(len(cuts)-1) if cuts[i]<=t<cuts[i+1])
    progress=(t-cuts[index])/(cuts[index+1]-cuts[index])
    frame=scene(index,progress,t)
    if index>0 and t-cuts[index]<0.2:
        frame=Image.blend(scene(index-1,1,t),frame,(t-cuts[index])/0.2)
    if number in (30,135,240,330,420):
        frame.save(ROOT/'source'/f'preview-{number}.jpg',quality=90)
    process.stdin.write(frame.tobytes())
process.stdin.close()
if process.wait()!=0:
    raise SystemExit('ffmpeg render failed')
print(f'Rendered {ROOT / "bridgetrace-15s.mp4"}: {DURATION}s, {SIZE}x{SIZE}, {FPS}fps')
