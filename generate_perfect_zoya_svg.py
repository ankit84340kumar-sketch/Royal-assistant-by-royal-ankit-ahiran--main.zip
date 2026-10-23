import os

svg_code = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="100%" height="100%">
  <!-- Pure solid white background per user's explicit requirement -->
  <rect width="1200" height="800" fill="#FFFFFF"/>
  
  <defs>
    <!-- Z Top Cyan/Blue Glow Gradient -->
    <linearGradient id="zTopGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0066FF"/>
      <stop offset="45%" stop-color="#0099FF"/>
      <stop offset="100%" stop-color="#0040B0"/>
    </linearGradient>

    <!-- Z Main Diagonal Gradient (Vibrant Cyan-Blue to Dark Obsidian) -->
    <linearGradient id="zDiagGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00E5FF"/>
      <stop offset="25%" stop-color="#0088FF"/>
      <stop offset="60%" stop-color="#003399"/>
      <stop offset="85%" stop-color="#0A101D"/>
      <stop offset="100%" stop-color="#020408"/>
    </linearGradient>

    <!-- Z Bottom Bar Gradient -->
    <linearGradient id="zBottomGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0080FF"/>
      <stop offset="60%" stop-color="#0040A0"/>
      <stop offset="100%" stop-color="#080C14"/>
    </linearGradient>

    <!-- O Left C-Arm Gradient (Deep Blue to Dark) -->
    <linearGradient id="oLeftGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0080FF"/>
      <stop offset="40%" stop-color="#0044BB"/>
      <stop offset="80%" stop-color="#0E1626"/>
      <stop offset="100%" stop-color="#04060A"/>
    </linearGradient>

    <!-- O Right C-Arm Gradient (Dark to Intense Blue) -->
    <linearGradient id="oRightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#060910"/>
      <stop offset="35%" stop-color="#0F1829"/>
      <stop offset="75%" stop-color="#0055CC"/>
      <stop offset="100%" stop-color="#0099FF"/>
    </linearGradient>

    <!-- Y Stem Gradient (Deep Obsidian) -->
    <linearGradient id="yStemGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#141A24"/>
      <stop offset="100%" stop-color="#030508"/>
    </linearGradient>

    <!-- Y Left Branch Gradient (Dark) -->
    <linearGradient id="yLeftGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#141C2B"/>
      <stop offset="70%" stop-color="#080C14"/>
      <stop offset="100%" stop-color="#020306"/>
    </linearGradient>

    <!-- Y Right Branch Gradient (Electric Blue Metallic Highlight) -->
    <linearGradient id="yRightGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0044BB"/>
      <stop offset="50%" stop-color="#0088FF"/>
      <stop offset="100%" stop-color="#00C8FF"/>
    </linearGradient>

    <!-- A Main Arch Gradient (Obsidian to Charcoal) -->
    <linearGradient id="aArchGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0D131C"/>
      <stop offset="50%" stop-color="#1A2230"/>
      <stop offset="100%" stop-color="#030508"/>
    </linearGradient>

    <!-- A Swoosh Arc Gradient (Luminous Cyan to Royal Blue Wave) -->
    <linearGradient id="aSwooshGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00E5FF"/>
      <stop offset="50%" stop-color="#0080FF"/>
      <stop offset="100%" stop-color="#003399"/>
    </linearGradient>
  </defs>

  <g id="ZOYA_WORDMARK" transform="translate(40, -10)">
    <!-- ==================== LETTER Z ==================== -->
    <!-- Top Horizontal Bar -->
    <path d="M 100 320 
             L 320 320 
             C 335 320 345 324 340 338 
             L 325 352 
             L 130 352 
             C 112 352 102 340 100 320 Z" 
          fill="url(#zTopGrad)"/>

    <!-- Sharp Diagonal Slash -->
    <path d="M 80 540 
             C 115 505 175 440 240 375 
             L 335 330 
             L 340 348 
             C 275 415 200 485 150 540 Z" 
          fill="url(#zDiagGrad)"/>

    <!-- Bottom Horizontal Bar -->
    <path d="M 150 515 
             L 325 515 
             C 335 515 335 538 320 538 
             L 140 538 
             C 125 538 132 526 150 515 Z" 
          fill="url(#zBottomGrad)"/>

    <!-- ==================== LETTER O ==================== -->
    <!-- Tech Stadium Stencil O: Left C-Arc with Gap at Top & Bottom -->
    <path d="M 450 320 
             C 375 320 335 368 335 430 
             C 335 492 375 540 450 540 
             L 458 540 
             L 458 510 
             L 450 510 
             C 395 510 368 475 368 430 
             C 368 385 395 350 450 350 
             L 458 350 
             L 458 320 Z" 
          fill="url(#oLeftGrad)"/>

    <!-- Tech Stadium Stencil O: Right C-Arc -->
    <path d="M 472 320 
             L 472 350 
             L 480 350 
             C 535 350 562 385 562 430 
             C 562 475 535 510 480 510 
             L 472 510 
             L 472 540 
             L 480 540 
             C 555 540 595 492 595 430 
             C 595 368 555 320 480 320 Z" 
          fill="url(#oRightGrad)"/>

    <!-- ==================== LETTER Y ==================== -->
    <!-- Vertical Center Stem -->
    <rect x="696" y="470" width="34" height="70" fill="url(#yStemGrad)"/>

    <!-- Left Angular Branch -->
    <path d="M 590 320 
             L 700 475 
             L 726 475 
             L 620 320 Z" 
          fill="url(#yLeftGrad)"/>

    <!-- Right Angular Branch with Bright Cyan/Blue Highlight -->
    <path d="M 700 475 
             L 845 320 
             L 810 320 
             L 685 458 Z" 
          fill="url(#yRightGrad)"/>

    <!-- ==================== LETTER A ==================== -->
    <!-- Left Leg of Arch -->
    <path d="M 790 540 
             C 830 460 880 330 930 320 
             C 980 330 1030 460 1070 540 
             L 1035 540 
             C 1005 480 965 365 930 360 
             C 895 365 855 480 825 540 Z" 
          fill="url(#aArchGrad)"/>

    <!-- Luminous Dynamic Cyan Wave Swoosh across the A Crossbar -->
    <path d="M 850 500 
             C 895 450 970 445 1025 518 
             C 985 485 925 470 882 506 Z" 
          fill="url(#aSwooshGrad)"/>
  </g>
</svg>'''

with open("public/logo.svg", "w") as f:
    f.write(svg_code)

with open("dist/logo.svg", "w") as f:
    f.write(svg_code)

print("Accurate Zoya logo SVG written successfully!")
