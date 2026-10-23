import base64

svg_content = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 768" width="100%" height="100%">
  <!-- Crisp pure white background as explicitly instructed -->
  <rect width="1024" height="768" fill="#FFFFFF"/>
  
  <defs>
    <!-- Vibrant Blue Metallic Gradient for Z, O, Y, A highlights -->
    <linearGradient id="zoyaBlueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00A3FF"/>
      <stop offset="35%" stop-color="#0066FF"/>
      <stop offset="70%" stop-color="#0038A8"/>
      <stop offset="100%" stop-color="#001848"/>
    </linearGradient>
    
    <!-- Deep Obsidian to Navy Gradient -->
    <linearGradient id="zoyaDarkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E2430"/>
      <stop offset="60%" stop-color="#0D1117"/>
      <stop offset="100%" stop-color="#05080E"/>
    </linearGradient>

    <!-- Glowing Cyan/Blue Arc Gradient for the Swoosh under A -->
    <linearGradient id="arcSwooshGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00C8FF"/>
      <stop offset="60%" stop-color="#0072FF"/>
      <stop offset="100%" stop-color="#002D80"/>
    </linearGradient>

    <!-- Z letter Top Bar Blue Glow -->
    <linearGradient id="zTopGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0077FF"/>
      <stop offset="70%" stop-color="#0099FF"/>
      <stop offset="100%" stop-color="#0044CC"/>
    </linearGradient>

    <!-- Z Diagonal Gradient -->
    <linearGradient id="zDiagGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00C0FF"/>
      <stop offset="40%" stop-color="#0066FF"/>
      <stop offset="85%" stop-color="#0E121A"/>
      <stop offset="100%" stop-color="#080B10"/>
    </linearGradient>

    <!-- Z Bottom Bar Gradient -->
    <linearGradient id="zBottomGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0090FF"/>
      <stop offset="80%" stop-color="#0B0F16"/>
      <stop offset="100%" stop-color="#06080D"/>
    </linearGradient>

    <!-- O Top Half Gradient -->
    <linearGradient id="oTopGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0066EE"/>
      <stop offset="50%" stop-color="#0044BB"/>
      <stop offset="100%" stop-color="#0A0E17"/>
    </linearGradient>

    <!-- O Bottom Half Gradient -->
    <linearGradient id="oBottomGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0088FF"/>
      <stop offset="60%" stop-color="#003399"/>
      <stop offset="100%" stop-color="#0A0E17"/>
    </linearGradient>

    <!-- Y Left Branch Gradient -->
    <linearGradient id="yLeftGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F141D"/>
      <stop offset="100%" stop-color="#080A0E"/>
    </linearGradient>

    <!-- Y Right Branch Gradient -->
    <linearGradient id="yRightGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0044CC"/>
      <stop offset="60%" stop-color="#0088FF"/>
      <stop offset="100%" stop-color="#00B4FF"/>
    </linearGradient>

    <!-- A Main Arch Gradient -->
    <linearGradient id="aArchGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0A0E16"/>
      <stop offset="50%" stop-color="#141A24"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
  </defs>

  <g id="ZOYA_LOGO" transform="translate(10, 0)">
    <!-- ==================== LETTER Z ==================== -->
    <!-- Top Horizontal Bar with subtle rounded left tip -->
    <path d="M 120 420 L 290 420 C 305 420 315 423 310 435 L 295 448 L 140 448 C 125 448 118 438 120 420 Z" 
          fill="url(#zTopGrad)" />
    <!-- Diagonal Stroke (flowing from lower-left to upper-right with brilliant cyan/blue gradient) -->
    <path d="M 100 610 C 130 580 180 520 230 470 L 305 435 L 310 450 C 260 500 200 560 160 610 Z" 
          fill="url(#zDiagGrad)" />
    <!-- Bottom Horizontal Bar -->
    <path d="M 160 585 L 310 585 C 315 585 315 605 305 605 L 150 605 C 140 605 145 595 160 585 Z" 
          fill="url(#zBottomGrad)" />

    <!-- ==================== LETTER O ==================== -->
    <!-- Distinctive Modern Tech Stadium/Pill Shape with Stencil Top Gap -->
    <!-- Left C-Ring of O -->
    <path d="M 410 420 C 350 420 320 460 320 512 C 320 565 350 605 410 605 L 415 605 L 415 580 L 410 580 C 365 580 345 550 345 512 C 345 475 365 445 410 445 L 415 445 L 415 420 Z" 
          fill="url(#oBottomGrad)" />
    <!-- Right C-Ring of O -->
    <path d="M 425 420 L 425 445 L 430 445 C 475 445 495 475 495 512 C 495 550 475 580 430 580 L 425 580 L 425 605 L 430 605 C 490 605 520 565 520 512 C 520 460 490 420 430 420 Z" 
          fill="url(#oTopGrad)" />

    <!-- ==================== LETTER Y ==================== -->
    <!-- Left Dark Branch -->
    <path d="M 520 420 L 610 540 L 610 615 L 638 615 L 638 540 L 545 420 Z" 
          fill="url(#yLeftGrad)" />
    <!-- Right Cyan/Blue Branch -->
    <path d="M 610 540 L 730 420 L 700 420 L 595 528 Z" 
          fill="url(#yRightGrad)" />

    <!-- ==================== LETTER A ==================== -->
    <!-- Smooth Aerodynamic Apex Arch (Obsidian Outer Curve) -->
    <path d="M 695 615 C 730 550 770 440 810 420 C 850 440 890 550 920 615 L 890 615 C 865 565 835 460 810 455 C 785 460 755 565 730 615 Z" 
          fill="url(#aArchGrad)" />
    <!-- Dynamic Cyan/Blue Wave Swoosh under Apex -->
    <path d="M 740 575 C 780 540 840 535 885 595 C 850 565 800 555 765 582 Z" 
          fill="url(#arcSwooshGrad)" />
  </g>
</svg>'''

with open("public/logo.svg", "w") as f:
    f.write(svg_content)

with open("dist/logo.svg", "w") as f:
    f.write(svg_content)

print("SVG logo created successfully!")
