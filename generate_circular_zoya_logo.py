# Creates a perfectly circular (1:1 square aspect ratio 800x800) SVG badge
# with pure white solid circular background, subtle elegant ring, and centered ZOYA wordmark.

svg_circular = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="100%" height="100%">
  <defs>
    <!-- Circular clip path for perfect roundness -->
    <clipPath id="circleClip">
      <circle cx="400" cy="400" r="392"/>
    </clipPath>

    <!-- Z Top Cyan/Blue Glow Gradient -->
    <linearGradient id="zTopGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0066FF"/>
      <stop offset="45%" stop-color="#0099FF"/>
      <stop offset="100%" stop-color="#0040B0"/>
    </linearGradient>

    <!-- Z Main Diagonal Gradient -->
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

    <!-- O Left C-Arm Gradient -->
    <linearGradient id="oLeftGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0080FF"/>
      <stop offset="40%" stop-color="#0044BB"/>
      <stop offset="80%" stop-color="#0E1626"/>
      <stop offset="100%" stop-color="#04060A"/>
    </linearGradient>

    <!-- O Right C-Arm Gradient -->
    <linearGradient id="oRightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#060910"/>
      <stop offset="35%" stop-color="#0F1829"/>
      <stop offset="75%" stop-color="#0055CC"/>
      <stop offset="100%" stop-color="#0099FF"/>
    </linearGradient>

    <!-- Y Stem Gradient -->
    <linearGradient id="yStemGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#141A24"/>
      <stop offset="100%" stop-color="#030508"/>
    </linearGradient>

    <!-- Y Left Branch Gradient -->
    <linearGradient id="yLeftGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#141C2B"/>
      <stop offset="70%" stop-color="#080C14"/>
      <stop offset="100%" stop-color="#020306"/>
    </linearGradient>

    <!-- Y Right Branch Gradient -->
    <linearGradient id="yRightGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0044BB"/>
      <stop offset="50%" stop-color="#0088FF"/>
      <stop offset="100%" stop-color="#00C8FF"/>
    </linearGradient>

    <!-- A Main Arch Gradient -->
    <linearGradient id="aArchGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0D131C"/>
      <stop offset="50%" stop-color="#1A2230"/>
      <stop offset="100%" stop-color="#030508"/>
    </linearGradient>

    <!-- A Swoosh Arc Gradient -->
    <linearGradient id="aSwooshGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00E5FF"/>
      <stop offset="50%" stop-color="#0080FF"/>
      <stop offset="100%" stop-color="#003399"/>
    </linearGradient>
  </defs>

  <!-- Solid Crisp Pure White Circle Disk -->
  <circle cx="400" cy="400" r="392" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="4"/>

  <!-- Centered & Minimized ZOYA Wordmark inside Circle -->
  <!-- Original wordmark span ~1000px width. Scaled by 0.62 to ~620px fits gracefully in 800px diameter circle with generous white padding -->
  <g clip-path="url(#circleClip)">
    <g id="ZOYA_WORDMARK_CENTERED" transform="translate(400, 400) scale(0.63) translate(-575, -430)">
      <!-- LETTER Z -->
      <path d="M 100 320 L 320 320 C 335 320 345 324 340 338 L 325 352 L 130 352 C 112 352 102 340 100 320 Z" fill="url(#zTopGrad)"/>
      <path d="M 80 540 C 115 505 175 440 240 375 L 335 330 L 340 348 C 275 415 200 485 150 540 Z" fill="url(#zDiagGrad)"/>
      <path d="M 150 515 L 325 515 C 335 515 335 538 320 538 L 140 538 C 125 538 132 526 150 515 Z" fill="url(#zBottomGrad)"/>

      <!-- LETTER O -->
      <path d="M 450 320 C 375 320 335 368 335 430 C 335 492 375 540 450 540 L 458 540 L 458 510 L 450 510 C 395 510 368 475 368 430 C 368 385 395 350 450 350 L 458 350 L 458 320 Z" fill="url(#oLeftGrad)"/>
      <path d="M 472 320 L 472 350 L 480 350 C 535 350 562 385 562 430 C 562 475 535 510 480 510 L 472 510 L 472 540 L 480 540 C 555 540 595 492 595 430 C 595 368 555 320 480 320 Z" fill="url(#oRightGrad)"/>

      <!-- LETTER Y -->
      <rect x="696" y="470" width="34" height="70" fill="url(#yStemGrad)"/>
      <path d="M 590 320 L 700 475 L 726 475 L 620 320 Z" fill="url(#yLeftGrad)"/>
      <path d="M 700 475 L 845 320 L 810 320 L 685 458 Z" fill="url(#yRightGrad)"/>

      <!-- LETTER A -->
      <path d="M 790 540 C 830 460 880 330 930 320 C 980 330 1030 460 1070 540 L 1035 540 C 1005 480 965 365 930 360 C 895 365 855 480 825 540 Z" fill="url(#aArchGrad)"/>
      <path d="M 850 500 C 895 450 970 445 1025 518 C 985 485 925 470 882 506 Z" fill="url(#aSwooshGrad)"/>
    </g>
  </g>
</svg>'''

with open("public/logo.svg", "w") as f:
    f.write(svg_circular)

with open("dist/logo.svg", "w") as f:
    f.write(svg_circular)

with open("public/zoya_logo.svg", "w") as f:
    f.write(svg_circular)

with open("dist/zoya_logo.svg", "w") as f:
    f.write(svg_circular)

print("Perfect Circular ZOYA Logo created successfully!")
