'use strict';
/* Core: icons, DOM helpers, API, store, realtime socket, formatting, sounds */

// ---------- icons (stroke icons, 24x24) ----------
const IC = {
  chat: '<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.1A8.5 8.5 0 1 1 21 12z"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  video: '<path d="m22 8-6 4 6 4V8z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  videoOff: '<path d="M10.7 6H14a2 2 0 0 1 2 2v3.3l1 1L22 8v8"/><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/><path d="m2 2 20 20"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  fwd: '<path d="M9 18l6-6-6-6"/>',
  more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/>',
  micOff: '<path d="m2 2 20 20M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6"/><path d="M17 16.9A7 7 0 0 1 5 11v-1m14 0v1a7 7 0 0 1-.1 1.2M12 18v4M8 22h8"/>',
  clip: '<path d="m21.4 11-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  cam: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  reply: '<path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  share: '<path d="m15 17 5-5-5-5"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>',
  trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  bellOff: '<path d="M13.7 21a2 2 0 0 1-3.4 0M18.6 13A17.9 17.9 0 0 1 18 8M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h14M18 8a6 6 0 0 0-9.3-5M2 2l20 20"/>',
  pinT: '<path d="M12 17v5M9 10.8V4h6v6.8l3 3.2v2H6v-2z"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  devices: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  phoneIn: '<path d="M16 2v6h6M22 2l-6 6"/>' ,
  phoneOut: '<path d="M22 8V2h-6M16 8l6-6"/>',
  phoneMiss: '<path d="m16 2 6 6M22 2l-6 6"/>',
  hangup: '<path d="M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 4.2 2 2 0 0 1 5.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L9 9.8" transform="rotate(135 12 12)"/>',
  flip: '<path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5"/><circle cx="12" cy="12" r="3"/><path d="m18 22-3-3 3-3M6 2l3 3-3 3"/>',
  min: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  app: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.9 7.9"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  speaker: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
};
const LOGO = '<svg class="mk" aria-hidden="true" viewBox="86 337 1089 549"><path fill="currentColor" fill-rule="evenodd" d="M104 870 104 876 111 880 767 880 767 878 657 763 646 752 640 749 224 749 220 751ZM819 481 1121 482 1131 480 1169 440 1170 433 1085 346 1080 343 957 343 819 478ZM95 501 90 528 90 557 97 586 107 606 120 624 132 636 152 650 165 656 184 660 575 660 587 663 605 673 777 848 804 868 829 878 853 881 1043 880 1058 871 1164 774 1164 771 1154 770 886 771 863 770 856 768 847 763 838 754 834 746 832 738 832 704 830 693 825 682 718 571 705 562 688 554 675 551 291 551 274 545 264 532 264 516 272 502 290 488 308 482 604 481 624 464 751 343 751 341 301 341 261 347 234 355 210 366 187 380 158 403 140 421 116 453 104 476Z"/><path fill="#ff1166" d="M933 343 790 343 604 526 604 528 744 529 748 527 932 348Z"/></svg>';
const WORDMARK = '<svg class="wm" aria-hidden="true" viewBox="67 204 2036 357"><path fill="currentColor" fill-rule="evenodd" d="M1018 498 1018 538 1030 539 1031 498ZM691 498 691 539 701 539 704 538 704 498ZM1052 497 1046 500 1038 509 1038 527 1041 532 1049 538 1068 538 1074 534 1077 530 1077 527 1070 524 1066 524 1059 528 1055 527 1051 524 1049 517 1051 512 1055 509 1062 509 1066 513 1068 513 1076 509 1076 505 1071 500 1065 497ZM952 498 938 497 932 501 931 498 919 498 919 555 932 554 933 536 938 539 949 539 954 537 961 530 964 523 964 513 959 503ZM941 508 946 509 951 515 951 521 949 524 942 528 936 526 932 521 933 513 937 509ZM870 504 866 512 866 523 870 532 873 535 881 539 891 539 897 536 899 537 899 539 911 539 911 498 899 497 899 499 897 500 891 497 881 497ZM888 508 894 510 898 515 897 523 889 528 882 526 879 522 880 513ZM863 497 854 497 848 501 847 498 844 497 835 497 835 539 848 538 848 515 854 509 863 509ZM827 497 816 497 814 500 808 497 797 497 792 499 785 506 782 514 782 521 785 529 791 535 799 538 807 538 813 535 814 536 813 541 807 545 800 545 794 541 790 541 785 546 785 548 788 551 797 555 812 555 819 552 825 546 827 541ZM803 508 809 509 815 517 813 523 807 527 800 526 795 519 796 513ZM711 498 711 538 724 539 724 514 729 509 736 509 740 515 740 539 752 539 752 509 750 504 741 497 731 497 725 501 723 500 723 498ZM608 504 604 512 604 524 606 529 612 536 618 539 629 539 635 536 637 539 649 538 648 497 637 497 635 500 629 497 618 497ZM622 509 629 509 635 514 636 521 631 527 624 528 618 524 616 516ZM528 498 516 497 505 520 495 497 482 498 498 536 498 539 495 543 485 544 485 555 499 555 506 550 514 534ZM659 485 659 496 657 498 654 498 654 508 657 508 659 510 660 530 668 538 681 539 683 538 683 528 678 528 673 525 672 510 677 508 683 508 683 498 672 496 671 485ZM970 480 970 538 982 538 982 516 986 510 994 509 998 514 998 538 1010 539 1011 511 1007 502 999 497 989 497 984 500 982 494 982 480ZM429 480 429 538 460 539 471 536 477 530 479 523 477 514 471 508 474 505 477 498 475 488 469 482 464 480ZM442 516 444 514 462 515 465 519 465 523 460 527 443 527ZM463 496 462 500 459 503 442 502 443 492 456 491 460 492ZM1022 479 1018 483 1018 489 1021 492 1026 493 1031 489 1031 483 1026 479ZM694 479 690 485 692 491 695 493 703 491 703 481 700 479ZM572 479 562 483 558 487 555 493 555 502 557 506 565 513 580 516 584 518 586 522 581 527 572 527 563 522 559 522 554 528 554 531 557 534 568 539 584 539 593 535 596 532 599 526 599 516 596 511 586 505 572 502 568 498 568 496 570 493 575 491 580 491 588 495 592 495 597 489 597 486 587 480ZM842 323 841 456 885 456 885 323ZM1702 332 1685 323 1677 321 1659 321 1643 327 1632 337 1631 323 1587 323 1587 457 1631 456 1632 381 1635 374 1640 369 1650 365 1662 367 1670 374 1673 380 1673 456 1720 457 1719 360 1712 343ZM1556 331 1537 322 1514 321 1500 326 1488 337 1487 323 1441 323 1442 457 1487 456 1487 383 1490 375 1497 368 1507 365 1514 366 1522 370 1525 373 1529 382 1529 456 1576 456 1575 362 1570 347ZM1025 341 1010 328 991 321 968 322 957 327 946 336 945 323 900 323 899 456 945 456 945 384 947 377 954 369 965 365 978 368 985 375 987 380 988 456 1035 456 1035 366 1030 349ZM605 343 600 350 593 366 590 380 590 398 595 419 603 433 613 444 632 455 644 458 659 458 669 456 678 452 689 443 691 444 691 456 735 456 735 323 691 323 690 337 683 330 670 323 663 321 642 321 621 329ZM652 366 659 364 667 364 678 368 687 378 689 383 689 396 684 405 677 411 670 414 655 414 647 410 639 401 636 391 638 380 640 376ZM1933 320 1919 324 1903 333 1889 347 1883 357 1878 371 1876 384 1877 401 1880 413 1886 426 1903 445 1919 454 1932 458 1961 458 1974 454 1992 443 2004 429 2007 423 2007 419 1973 401 1970 401 1965 408 1957 413 1938 413 1927 405 1923 397 1923 380 1926 374 1937 365 1944 363 1955 364 1963 368 1969 374 1972 374 2002 357 2004 353 1996 341 1988 333 1975 325 1964 321 1951 319ZM1772 323 1754 333 1742 345 1733 361 1729 376 1728 396 1734 419 1743 434 1753 444 1760 449 1773 455 1791 459 1808 459 1832 453 1847 444 1859 432 1861 427 1829 407 1827 407 1822 413 1815 418 1801 421 1792 420 1784 416 1776 408 1774 403 1867 402 1868 375 1863 357 1855 344 1844 333 1828 324 1807 319 1788 319ZM1774 373 1776 367 1783 359 1794 354 1804 354 1814 358 1821 365 1824 372 1823 374ZM1348 318 1335 321 1321 327 1311 334 1298 348 1292 359 1287 375 1287 400 1291 415 1296 425 1304 436 1318 448 1330 454 1343 458 1373 458 1386 454 1401 446 1415 433 1421 425 1428 410 1430 401 1430 375 1426 361 1418 347 1407 335 1399 329 1378 320 1367 318ZM1351 362 1363 362 1370 365 1378 372 1383 382 1383 395 1379 404 1372 411 1363 415 1352 415 1344 412 1336 405 1331 394 1331 382 1333 376 1342 366ZM762 287 762 320 760 323 746 323 746 364 762 366 762 419 765 430 773 443 777 447 788 453 799 456 829 456 829 414 819 414 814 412 808 406 806 398 807 366 827 364 827 323 808 323 806 321 806 287ZM2027 283 2027 320 2010 321 2010 365 2027 366 2027 417 2031 433 2037 443 2052 454 2068 458 2098 457 2098 415 2086 414 2081 412 2075 406 2073 401 2073 366 2096 365 2096 321 2074 321 2072 319 2072 283ZM862 265 851 268 842 276 839 283 838 292 841 302 848 310 856 314 864 315 877 311 884 304 888 294 888 287 885 278 878 270 869 266ZM501 257 486 259 472 263 455 272 442 284 435 294 431 305 429 315 430 332 433 342 439 353 453 366 474 375 511 381 526 385 534 392 534 400 529 406 523 409 512 411 494 410 480 406 472 402 455 388 452 388 421 421 421 423 438 439 461 451 484 457 513 458 528 456 547 450 560 443 572 432 579 422 584 408 584 381 580 369 575 361 562 350 538 340 502 334 488 330 480 322 481 313 486 308 493 305 519 304 533 308 541 312 554 322 557 322 583 292 585 286 572 274 553 264 530 258ZM1183 254 1162 257 1147 262 1130 271 1107 292 1097 307 1090 323 1086 340 1085 363 1087 378 1094 400 1104 417 1117 432 1133 444 1151 453 1169 458 1196 459 1221 454 1248 440 1259 431 1276 410 1280 402 1280 398 1235 376 1229 387 1219 397 1205 405 1185 408 1168 404 1156 397 1147 388 1139 374 1136 353 1138 341 1143 330 1149 322 1161 312 1176 306 1193 305 1203 307 1218 315 1228 325 1235 337 1237 337 1280 313 1280 310 1267 290 1256 279 1242 269 1217 258 1202 255ZM96 259 87 272 78 293 76 304 76 325 78 335 84 349 88 355 105 370 113 374 128 378 304 378 308 380 314 388 314 401 311 407 302 413 244 413 208 445 206 444 206 413 124 413 72 468 71 472 307 471 323 467 347 455 368 436 378 422 384 409 388 392 388 375 385 361 376 345 366 335 350 326 331 322 239 322 208 348 206 346 206 322 160 322 154 319 149 311 149 298 154 289 164 284 262 284 311 219 315 211 180 211 166 213 147 219 132 227 114 240Z"/><path fill="#ff1166" d="M414 208 343 208 291 278 288 285 358 285 413 212Z"/></svg>';
const icon = (n, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n] || ''}</svg>`;
const TICK1 = '<svg class="ticks" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const TICK2 = (read) => `<svg class="ticks${read ? ' read' : ''}" viewBox="0 0 24 24"><path d="M2 12.5l4.5 4.5L16 7.5"/><path d="M11.5 16l1 1L22 7.5"/></svg>`;
const TICK0 = '<svg class="ticks" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/></svg>';

// ---------- DOM helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function h(html) { const tpl = document.createElement('template'); tpl.innerHTML = html.trim(); return tpl.content.firstElementChild; }
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function linkify(text) {
  return esc(text).replace(/\b((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]'"])/gi, (u) => {
    const href = u.startsWith('http') ? u : 'https://' + u;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${u}</a>`;
  });
}
const isEmojiOnly = (s) => s && s.length <= 12 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(s) && !/^[\d#*\s]+$/.test(s);

let toastTimer;
function toast(msg) {
  $$('.toast').forEach((x) => x.remove());
  const el = h(`<div class="toast" role="status">${esc(msg)}</div>`);
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

function initials(name) {
  const p = String(name || '?').trim().split(/\s+/);
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
}
const AV_COLORS = ['#122029', '#2f6f86', '#6b4fe0', '#b0306e', '#147a6a', '#c25a12', '#3550b4', '#5f7a14'];
function avatar(o, cls = '', dot = false) {
  if (!o) return `<div class="av ${cls}">?</div>`;
  if (o.saved) return `<div class="av saved ${cls}">${icon('bookmark')}</div>`;
  const color = AV_COLORS[(o.id || 0) % AV_COLORS.length];
  const inner = o.avatar ? `<img src="${esc(o.avatar)}" alt="" loading="lazy" decoding="async">` : esc(initials(o.name || o.title));
  return `<div class="av ${cls}" style="background:${color}">${inner}${dot ? '<span class="dot"></span>' : ''}</div>`;
}

// ---------- formatting ----------
const fmt = {
  time(ts) { return new Date(ts).toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit', hour12: false }); },
  sameDay(a, b) { const x = new Date(a), y = new Date(b); return x.toDateString() === y.toDateString(); },
  day(ts) {
    const d = new Date(ts); const n = new Date();
    if (this.sameDay(d, n)) return t('today');
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (this.sameDay(d, y)) return t('yesterday');
    const opts = { day: 'numeric', month: 'long' };
    if (d.getFullYear() !== n.getFullYear() || LANG === 'fa') opts.year = 'numeric';
    return d.toLocaleDateString(LOCALE(), opts);
  },
  listTime(ts) {
    if (!ts) return '';
    const d = new Date(ts); const n = new Date();
    if (this.sameDay(d, n)) return this.time(ts);
    if (n - d < 6 * 86400000) return d.toLocaleDateString(LOCALE(), { weekday: 'short' });
    return d.toLocaleDateString(LOCALE(), { day: 'numeric', month: 'short' });
  },
  lastSeen(u) {
    if (!u) return '';
    if (u.online) return t('online');
    if (!u.last_seen) return t('last_seen_recently');
    const diff = Date.now() - u.last_seen;
    if (diff < 60000) return t('last_seen', { t: t('just_now') });
    if (diff < 3600000) return t('last_seen', { t: t('min_ago', { n: this.num(Math.floor(diff / 60000)) }) });
    if (this.sameDay(u.last_seen, Date.now())) return t('last_seen', { t: t('today_at', { t: this.time(u.last_seen) }) });
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (this.sameDay(u.last_seen, y)) return t('last_seen', { t: t('yesterday_at', { t: this.time(u.last_seen) }) });
    return t('last_seen', { t: new Date(u.last_seen).toLocaleDateString(LOCALE(), { day: 'numeric', month: 'short' }) });
  },
  num(n) { return Number(n).toLocaleString(LOCALE()); },
  dur(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const m = Math.floor(sec / 60), s = sec % 60;
    const out = `${m}:${String(s).padStart(2, '0')}`;
    return LANG === 'fa' ? out.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) : out;
  },
  size(b) {
    const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return `${this.num(b.toFixed(i ? 1 : 0))} ${u[i]}`;
  },
};

// ---------- API ----------
const API = {
  token: (() => { try { return localStorage.getItem('sc_token'); } catch { return null; } })(),
  setToken(tok) { this.token = tok; try { tok ? localStorage.setItem('sc_token', tok) : localStorage.removeItem('sc_token'); } catch {} },
  async req(method, path, body) {
    let r;
    try {
      r = await fetch(path, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin',
      });
    } catch { const e = new Error('NETWORK'); e.code = 'NETWORK'; throw e; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(j.error || 'HTTP_' + r.status); e.code = j.error || 'default'; e.status = r.status;
      if (r.status === 401 && !path.startsWith('/api/auth/')) App.onUnauthorized();
      throw e;
    }
    return j;
  },
  get(p) { return this.req('GET', p); },
  post(p, b) { return this.req('POST', p, b || {}); },
  patch(p, b) { return this.req('PATCH', p, b || {}); },
  del(p) { return this.req('DELETE', p); },
  upload(file, name, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('POST', '/api/files');
      if (this.token) x.setRequestHeader('Authorization', 'Bearer ' + this.token);
      x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      x.setRequestHeader('X-File-Name', encodeURIComponent(name || file.name || 'file'));
      x.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      x.onload = () => {
        let j = {}; try { j = JSON.parse(x.responseText); } catch {}
        if (x.status >= 200 && x.status < 300) resolve(j.file);
        else { const e = new Error(j.error || 'UPLOAD'); e.code = j.error || 'default'; reject(e); }
      };
      x.onerror = () => { const e = new Error('NETWORK'); e.code = 'NETWORK'; reject(e); };
      x.send(file);
      if (onProgress) onProgress(0);
      file._xhr = x;
    });
  },
};

// ---------- store ----------
const S = {
  me: null,
  config: {},
  chats: new Map(),      // id -> chat
  msgs: new Map(),       // chatId -> { list: [], hasMore, loaded }
  users: new Map(),      // id -> user
  cur: null,             // open chat id
  typing: new Map(),     // chatId -> Map(userId -> {until, action})
  tab: 'chats',
  filter: 'all',
  query: '',
  ice: [{ urls: ['stun:stun.l.google.com:19302'] }],
  online: navigator.onLine,
  wsUp: false,
  sounds: (() => { try { return localStorage.getItem('sc_sounds') !== '0'; } catch { return true; } })(),
};

function putUser(u) {
  if (!u || !u.id) return u;
  const prev = S.users.get(u.id) || {};
  const merged = { ...prev, ...u };
  S.users.set(u.id, merged);
  return merged;
}
function putChat(c) {
  if (!c) return c;
  learn(c);
  if (c.peer) c.peer = putUser(c.peer);
  const prev = S.chats.get(c.id);
  const merged = prev ? { ...prev, ...c } : c;
  S.chats.set(c.id, merged);
  return merged;
}
function chatTitle(c) {
  if (!c) return '';
  if (c.type === 'direct' && c.peer && S.me && c.peer.id === S.me.id) return t('saved_messages');
  return c.type === 'direct' ? (c.peer ? (S.users.get(c.peer.id) || c.peer).name : c.title) : c.title;
}
function chatAvatarObj(c) {
  if (c.type === 'direct' && c.peer && S.me && c.peer.id === S.me.id) return { saved: true };
  if (c.type === 'direct') return S.users.get(c.peer.id) || c.peer;
  return { id: c.id, name: c.title, avatar: c.avatar };
}
const isSaved = (c) => c && c.type === 'direct' && c.peer && S.me && c.peer.id === S.me.id;
function learn(m) {
  if (m && m.sender_id && m.sender_name && !S.users.has(m.sender_id)) S.users.set(m.sender_id, { id: m.sender_id, name: m.sender_name });
  if (m && m.last_message) learn(m.last_message);
  return m;
}
const userName = (id) => (S.me && id === S.me.id ? t('you') : ((S.users.get(id) || {}).name || '…'));

function msgPreview(m) {
  if (!m) return '';
  if (m.deleted) return t('deleted_msg');
  switch (m.kind) {
    case 'image': return '🖼 ' + (m.text || t('photo'));
    case 'video': return '🎬 ' + (m.text || t('video'));
    case 'voice': return '🎤 ' + t('voice') + (m.meta && m.meta.duration ? ' ' + fmt.dur(m.meta.duration) : '');
    case 'audio': return '🎵 ' + (m.file ? m.file.name : '');
    case 'file': return '📎 ' + (m.file ? m.file.name : t('file'));
    case 'location': return '📍 ' + t('location');
    case 'call': return callLabel(m);
    case 'system': return sysText(m);
    default: return m.text;
  }
}
function callLabel(m) {
  const meta = m.meta || {};
  const mine = S.me && m.sender_id === S.me.id;
  const icon = meta.video ? '📹 ' : '📞 ';
  if (meta.status === 'ended') return icon + (mine ? t('outgoing_call') : (meta.video ? t('incoming_video') : t('incoming_call'))) + ' · ' + fmt.dur(meta.duration);
  if (meta.status === 'busy') return icon + t('busy_call');
  if (meta.status === 'declined') return icon + t('declined_call');
  if (mine) return icon + t('cancelled_call');
  return icon + t('missed_call');
}
function sysText(m) {
  const meta = m.meta || {};
  const u = userName(m.sender_id);
  const names = (meta.users || []).map((x) => (S.me && x.id === S.me.id ? t('you') : x.name)).join('، ');
  switch (meta.action) {
    case 'created': return t('sys_created', { u, t: meta.title || '' });
    case 'renamed': return t('sys_renamed', { u, t: meta.title || '' });
    case 'added': return t('sys_added', { u, x: names });
    case 'removed': return t('sys_removed', { u, x: names });
    case 'left': return t('sys_left', { u });
    case 'joined': return t('sys_joined', { u });
    default: return '';
  }
}

// ---------- sounds (generated, no audio files) ----------
const Sound = {
  ctx: null, out: null,
  ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        // compressor + gain = loud but not distorted
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.knee.value = 6; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
        this.out = this.ctx.createGain(); this.out.gain.value = 1.6;
        comp.connect(this.out); this.out.connect(this.ctx.destination);
        this.bus = comp;
      } catch { return null; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  },
  tone(freqs, dur, vol = 0.4, when = 0, type = 'triangle') {
    const ctx = this.ensure(); if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(this.bus);
    for (const f of [].concat(freqs)) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      o.connect(g); o.start(t0); o.stop(t0 + dur + 0.05);
      // bright overtone so it cuts through on phone speakers
      const o2 = ctx.createOscillator(); const g2 = ctx.createGain(); g2.gain.value = 0.35;
      o2.type = 'sine'; o2.frequency.value = f * 2; o2.connect(g2); g2.connect(g); o2.start(t0); o2.stop(t0 + dur + 0.05);
    }
  },
  msg() {
    if (!S.sounds) return;
    this.tone(988, 0.18, 0.7); this.tone(1319, 0.22, 0.7, 0.11); this.tone(1760, 0.32, 0.55, 0.22);
    if (navigator.vibrate && document.hidden) { try { navigator.vibrate([150, 80, 150]); } catch {} }
  },
  sent() { if (!S.sounds) return; this.tone(784, 0.1, 0.25); },
  loopTimer: null,
  startRing(kind) {
    this.stopRing();
    const play = () => {
      if (kind === 'incoming') {
        // classic double-ring, repeated
        for (let i = 0; i < 2; i++) {
          const b = i * 0.9;
          for (let k = 0; k < 4; k++) this.tone([1046, 1318], 0.09, 0.8, b + k * 0.1, 'square');
          this.tone([784, 1046], 0.35, 0.7, b + 0.42);
        }
        if (navigator.vibrate) { try { navigator.vibrate([600, 250, 600]); } catch {} }
      } else { this.tone([440, 480], 1.2, 0.45, 0, 'sine'); }
    };
    play();
    this.loopTimer = setInterval(play, kind === 'incoming' ? 2600 : 4000);
  },
  stopRing() { clearInterval(this.loopTimer); this.loopTimer = null; if (navigator.vibrate) { try { navigator.vibrate(0); } catch {} } },
  end() { this.tone(523, 0.25, 0.45); this.tone(392, 0.4, 0.45, 0.26); },
};

// ---------- realtime ----------
const RT = {
  ws: null, retry: 0, timer: null, handlers: {}, queue: [],
  on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); },
  connect() {
    if (!API.token) return;
    clearTimeout(this.timer);
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(API.token)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0; S.wsUp = true; App.connState();
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
      if (S.cur) this.send({ t: 'focus', chat_id: document.hidden ? null : S.cur });
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'auth-error') { App.onUnauthorized(); return; }
      for (const fn of this.handlers[m.t] || []) { try { fn(m); } catch (err) { console.error(err); } }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      S.wsUp = false; App.connState();
      if (!API.token) return;
      const delay = Math.min(15000, 500 * 2 ** this.retry++) + Math.random() * 400;
      this.timer = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {};
  },
  send(m) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
    else if (m.t.startsWith('call:')) this.queue.push(m);
  },
  close() { const w = this.ws; this.ws = null; if (w) w.close(); clearTimeout(this.timer); S.wsUp = false; },
};
// keep-alive for proxies/mobile networks
setInterval(() => { if (RT.ws && RT.ws.readyState === 1) RT.send({ t: 'ping' }); }, 20000);
