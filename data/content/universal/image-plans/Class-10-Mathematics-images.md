# Class 10 Mathematics: image plan (NCERT jemh1, 14 chapters)

**Who is writing, for whom:** the build lead, for Noor, who generates the images with AI image tools.
**What it delivers:** the full list of concept images for Class 10 Mathematics, with a ready prompt for each file in `Class-10-Mathematics-images.csv`.
**How it works:** every image must teach the whole idea at a glance. Where the idea is spatial the plan uses several views of one object, a cutaway, an exploded view or a frame sequence. No words, numbers or letters are baked in; the app adds bilingual labels with numbered pins.

## How to generate

1. Open `Class-10-Mathematics-images.csv`. One row is one file. Paste the `prompt` column into the tool and the `negative_prompt` column into its negative field (if it has none, add "no text, no numbers" at the end of the prompt).
2. **One style per set.** All files that share an `image_id` (front, side, 34, top, cut, exploded, f1, f2 ...) must look like one object photographed or rendered together: same object, same camera distance, same light, same background, same size. Generate the first file, then reuse it as the reference image for the others in the set (or fix the seed).
3. **Format:** square (1:1) or 4:3 as the `composition` column says, PNG, 1600 px on the long side at least. Plain light background for models and diagrams; natural light and true colours for photos and scenes.
4. **Check before you keep it.** Open the `must_show` and `accuracy` columns beside the picture. Mathematics must be exact: right angles must look square, parallel lines parallel, a cone and cylinder "of equal radius and height" must really look equal, counts must be right (for example 3 red, 5 blue, 2 green balls). If the tool miscounts or bends a line, redo the image; a wrong picture teaches the wrong thing. For crowded counted images (the 52 cards, the 36-cell dice grid) it is fine to generate one part and copy it in an editor.
5. **Leave the empty space.** The `pin_targets` column lists the parts the app will label, in order; keep clear space beside each.
6. **File names:** `C10-MAT-CH<NN>-<NN>_<slug>[-suffix].png`, exactly as in the `file_name` column (same naming as Science).
7. **Never keep:** any text, numbers or logos in the picture, close-up children's faces, brand marks on tyres, ladders or shoes.

Files with a suffix: `-front`, `-side`, `-34` (three-quarter), `-top`, `-cut` (cutaway), `-exploded`, `-f1 -f2 ...` (frames of a sequence), plus a few named ones (`-head/-tail`, `-fair/-unfair`, `-net`, `-34-back`, `-crossing/-parallel`).

## Totals

- **143 image IDs, 248 files.** Must (P1): 94 IDs, 180 files. Good (P2): 49 IDs, 68 files.
- Files by kind: SEQUENCE 106, SCENE 50, DIAGRAM-ART 26, MULTI-VIEW 26, 3D-MODEL 22, 3D-EXPLODED 9, 3D-CUTAWAY 6, PHOTO 3.

| Chapter | IDs | Files | P1 files | P2 files |
|---|---|---|---|---|
| 1. Real Numbers | 10 | 19 | 17 | 2 |
| 2. Polynomials | 11 | 18 | 10 | 8 |
| 3. Pair of Linear Equations in Two Variables | 8 | 15 | 11 | 4 |
| 4. Quadratic Equations | 8 | 16 | 8 | 8 |
| 5. Arithmetic Progressions | 10 | 18 | 12 | 6 |
| 6. Triangles | 11 | 16 | 14 | 2 |
| 7. Coordinate Geometry | 9 | 13 | 9 | 4 |
| 8. Introduction to Trigonometry | 10 | 21 | 19 | 2 |
| 9. Some Applications of Trigonometry | 11 | 15 | 12 | 3 |
| 10. Circles | 10 | 16 | 11 | 5 |
| 11. Areas Related to Circles | 10 | 16 | 12 | 4 |
| 12. Surface Areas and Volumes | 12 | 27 | 16 | 11 |
| 13. Statistics | 11 | 19 | 15 | 4 |
| 14. Probability | 12 | 19 | 14 | 5 |

## The 10 to make first

These teach the hardest ideas of the book and set the style for everything else. Make them first, check the style, then do the rest.

1. **C10-MAT-CH08-05** (4 files): the swinging arm at 0, 30, 60 and 90 degrees: height grows, floor shadow shrinks (sin and cos at the special angles).
2. **C10-MAT-CH11-05** (3 files): a circle cut in sectors and rearranged into a rectangle (area of a circle).
3. **C10-MAT-CH12-10** (4 files): a cone filled with sand poured three times into an equal cylinder (volume one third).
4. **C10-MAT-CH05-07** (3 files): a stair of cubes and its upside-down copy lock into a rectangle (sum of an AP).
5. **C10-MAT-CH04-02** (3 files): algebra tiles that assemble into a rectangle (factorising a quadratic).
6. **C10-MAT-CH06-04** (2 files): a triangular frame with a string parallel to the base (basic proportionality theorem).
7. **C10-MAT-CH09-03** (2 files): depression and elevation in a table model: alternate angles are equal.
8. **C10-MAT-CH10-03** (2 files): the spoke to the contact point and a try-square: tangent is perpendicular to the radius.
9. **C10-MAT-CH02-05** (3 files): a wire arch over a rod: two, one or no zeroes.
10. **C10-MAT-CH14-03** (3 files): the fair die in three views and its net (equally likely outcomes).

## Chapter lists

Priority P1 = must, P2 = good. Files = number of pictures to generate for that ID.

### Chapter 1. Real Numbers

| ID | Picture | Kind | Files | Priority |
|---|---|---|---|---|
| 01 | **two cars meet again**: Two things repeating at different speeds meet at the start again only after a common multiple of their times (the idea behind LCM). | SEQUENCE | 4 (f1, f2, f3, f4) | P1 |
| 02 | **factor tree tiles**: A composite number splits step by step into prime numbers that cannot be split further (a factor tree). | DIAGRAM-ART | 1 | P1 |
| 03 | **same primes two trees**: However you split a number, you end with the same set of primes: the number's prime factorisation is unique. | DIAGRAM-ART | 2 (f1, f2) | P1 |
| 04 | **tiling the floor**: The largest square tile that fits a rectangular floor exactly, with no cutting, has a side equal to the HCF of the floor's length and breadth. | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 05 | **shared primes rope loops**: HCF takes the primes the two numbers share; LCM takes every prime of both, shared ones only once more than needed (the larger power). | DIAGRAM-ART | 1 | P1 |
| 06 | **packing sweets equally**: The greatest number of identical packets you can make from two different stocks is their HCF. | SCENE | 1 | P2 |
| 07 | **diagonal string**: The diagonal of a square does not fit a whole number or fraction of its side: root 2 is irrational. | SEQUENCE | 2 (f1, f2) | P1 |
| 08 | **root spiral board**: Right triangles with a shared unit leg build lengths root 2, root 3, root 4 ... one after another in a spiral. | DIAGRAM-ART | 1 | P1 |
| 09 | **zooming the ruler**: Between any two marks there are more numbers: zooming in on root 5 never finds an end to its digits. | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 10 | **bead patterns**: Rational numbers have decimals that end or repeat a block; irrational numbers go on forever with no repeating block. | DIAGRAM-ART | 1 | P2 |

### Chapter 2. Polynomials

| ID | Picture | Kind | Files | Priority |
|---|---|---|---|---|
| 01 | **garden hose arch**: A thrown stream of water, a ball or a jet follows a smooth U-shaped curve (a parabola), the shape of a quadratic polynomial. | SCENE | 1 | P1 |
| 02 | **ball flight strobe**: A ball's flight is a parabola that meets the ground twice: those two meeting points are the zeroes. | PHOTO | 1 | P1 |
| 03 | **arch bridge**: Real arches such as bridges follow a curve with a high point and two ends at the ground level. | SCENE | 1 | P2 |
| 04 | **wire curves family**: A linear polynomial is a straight line, a quadratic is a U or an inverted U, a cubic is an S: the degree decides the shape. | DIAGRAM-ART | 1 | P1 |
| 05 | **arch and the rod**: A quadratic's graph can meet the horizontal line in two points, one point or none: so a quadratic has 2, 1 or 0 zeroes. | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 06 | **cubic wire crossings**: A cubic's graph can cross the horizontal line at 3, 2 or 1 points, so a cubic has at most 3 zeroes. | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 07 | **arch symmetry line**: The two zeroes of a quadratic lie evenly on either side of its axis, so their sum is twice the axis position (sum of zeroes = -b/a). | DIAGRAM-ART | 1 | P1 |
| 08 | **bowl and dome**: The sign of the leading coefficient decides if the curve opens up (a>0) or down (a<0). | DIAGRAM-ART | 2 (f1, f2) | P2 |
| 09 | **y intercept pole**: The constant term is where the curve cuts the vertical axis: the height of the wire at the zero position. | DIAGRAM-ART | 1 | P2 |
| 10 | **arch slide**: Sliding the same curve sideways moves both zeroes together by the same amount, changing their sum but not their gap. | SEQUENCE | 3 (f1, f2, f3) | P2 |
| 11 | **dish antenna**: A curve of degree two also forms the dish of an antenna: parallel rays meet at one point. | SCENE | 1 | P2 |

### Chapter 3. Pair of Linear Equations in Two Variables

| ID | Picture | Kind | Files | Priority |
|---|---|---|---|---|
| 01 | **mela two rides**: Two unknown prices or numbers at a fair lead to two linear equations. | SCENE | 1 | P1 |
| 02 | **peg line**: One linear equation in two variables has many solutions and they all lie on one straight line. | DIAGRAM-ART | 1 | P1 |
| 03 | **two threads three cases**: Two straight lines can cross at one point (one solution), run parallel (no solution) or lie on each other (infinite solutions). | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 04 | **real lines**: Crossing roads give one common point; parallel tracks never meet. | SCENE | 2 (crossing, parallel) | P2 |
| 05 | **balance substitution**: Substitution: if one thing equals a bundle of others, replace it by that bundle in the second balance. | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 06 | **balance elimination**: Elimination: take the same thing off both pans, or subtract one balance from the other, and what is left gives the answer. | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 07 | **combo counter**: Two shopping bills for different mixes of the same two items give two equations. | SCENE | 1 | P2 |
| 08 | **chalk lines flag**: The solution of a pair of equations is the one point lying on both lines. | SCENE | 1 | P2 |

### Chapter 4. Quadratic Equations

| ID | Picture | Kind | Files | Priority |
|---|---|---|---|---|
| 01 | **hall and carpet**: An unknown width plus a known area gives a quadratic equation (carpet in a hall with an even border). | SCENE | 1 | P1 |
| 02 | **tiles build rectangle**: A quadratic expression is the area of a rectangle: x² + 5x + 6 splits into pieces that join into a rectangle whose sides are the two factors. | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 03 | **standard form pieces**: ax² + bx + c = 0 is a sum of three kinds of pieces: an area piece (x²), a strip piece (x) and a constant piece (1). | 3D-EXPLODED | 1 | P1 |
| 04 | **shrinking rectangle**: A product is zero only when one of its factors is zero: a rectangle's area vanishes when one side shrinks to nothing. | SEQUENCE | 3 (f1, f2, f3) | P2 |
| 05 | **ball and rope height**: Nature of roots: a ball thrown up passes a fixed height twice (two roots), just touches it once (equal roots), or never reaches it (no real roots). | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 06 | **garden plot tape**: Area and perimeter of a plot give quadratic equations in its sides. | SCENE | 1 | P2 |
| 07 | **factor pair rectangles**: Factorising means finding the pair of factors (rectangle sides) that gives both the right area and the right sum. | SEQUENCE | 3 (f1, f2, f3) | P2 |
| 08 | **train journey**: Speed, distance and time problems give quadratic equations. | SCENE | 1 | P2 |

### Chapter 5. Arithmetic Progressions

| ID | Picture | Kind | Files | Priority |
|---|---|---|---|---|
| 01 | **ghat steps**: Equal steps up or down give a list of numbers growing by the same amount each time (an AP). | SCENE | 1 | P1 |
| 02 | **assembly chair rows**: Rows that grow by the same number of seats each row: a total found by adding an AP. | SCENE | 1 | P1 |
| 03 | **coin stacks**: Stacks growing by one coin each: the list 1, 2, 3, 4, 5 has a first term and a common difference. | MULTI-VIEW | 2 (34, front) | P1 |
| 04 | **bamboo ladder**: Rungs getting shorter by the same length each step form a decreasing AP. | PHOTO | 1 | P2 |
| 05 | **staircase of blocks**: The nth term is the first term plus (n-1) steps of equal size: height of block n = a + (n-1)d. | MULTI-VIEW | 2 (34, front) | P1 |
| 06 | **fifth term parts**: The 5th term = the first term plus 4 steps of d: seeing the pieces proves a_n = a + (n-1)d. | 3D-EXPLODED | 2 (34, exploded) | P1 |
| 07 | **stairs pair up**: Adding a staircase to its upside-down copy makes a rectangle, so the sum is half of (first + last) times n. | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 08 | **stacked pipes**: A heap of logs or pipes with one fewer in each higher row: a total counted by an AP. | SCENE | 1 | P1 |
| 09 | **odd numbers make squares**: Adding the next odd number of tiles always makes a bigger perfect square: the sum of the first n odd numbers is n squared. | SEQUENCE | 4 (f1, f2, f3, f4) | P2 |
| 10 | **well rings**: A cost that rises by the same amount for every metre dug is an AP. | 3D-CUTAWAY | 1 | P2 |

### Chapter 6. Triangles

| ID | Picture | Kind | Files | Priority |
|---|---|---|---|---|
| 01 | **tree and stick shadows**: The shadows of a tall tree and a short stick are in the same ratio as their heights, because the triangles are similar. | SCENE | 1 | P1 |
| 02 | **nested katoris**: Similar figures have the same shape and different size: every length is multiplied by the same scale factor. | MULTI-VIEW | 2 (34, top) | P1 |
| 03 | **toy and real auto**: A scale model is similar to the real thing: all lengths in the same ratio. | SCENE | 1 | P1 |
| 04 | **triangle frame string**: A line parallel to one side cuts the other two sides in the same ratio (the basic proportionality theorem). | MULTI-VIEW | 2 (34, front) | P1 |
| 05 | **string slides**: Wherever the parallel line is placed, both sides are divided in the same ratio. | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 06 | **nested triangles**: Triangles with the same angles are similar: a small one fits inside a bigger one, with matching sides parallel. | MULTI-VIEW | 2 (34, top) | P1 |
| 07 | **matching corners**: AA: if two angles of one triangle equal two angles of another, they are similar. | DIAGRAM-ART | 1 | P1 |
| 08 | **straw triangles**: SSS: if all three sides are in the same ratio, the triangles are similar. | DIAGRAM-ART | 1 | P1 |
| 09 | **straw angles**: SAS: equal included angle and arms in the same ratio make the triangles similar. | DIAGRAM-ART | 1 | P2 |
| 10 | **pole diorama**: Right triangles made by an object, its shadow and the sun's ray are similar: ratio of heights = ratio of shadows. | 3D-MODEL | 1 | P1 |
| 11 | **lamp post shadow**: A lamp, a person and the shadow form similar triangles, so the shadow length can be found. | SCENE | 1 | P2 |

### Chapter 7. Coordinate Geometry

| ID | Picture | Kind | Files | Priority |
|---|---|---|---|---|
| 01 | **town grid**: Streets that cross at right angles make a grid, and every place on it can be named by two numbers: how far across and how far up. | SCENE | 1 | P1 |
| 02 | **right triangle on grid**: The distance between two points is the long side of a right triangle whose short sides are their gaps across and up (distance formula from... | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 03 | **shortcut across**: The straight-line distance is shorter than going round along the roads: the diagonal of a right triangle. | SCENE | 1 | P2 |
| 04 | **rope in five parts**: To divide a segment in the ratio 2:3, cut it into 5 equal parts and take the point after the 2nd part (section formula idea). | SEQUENCE | 2 (f1, f2) | P1 |
| 05 | **balance ruler**: The midpoint is where equal weights balance; a section point is where unequal weights balance, nearer the heavier end. | SEQUENCE | 2 (f1, f2) | P1 |
| 06 | **cinema seats**: A position on a grid is given by its row and its column: a point is two numbers. | SCENE | 1 | P2 |
| 07 | **four flags**: Two perpendicular lines divide a plane into four quadrants: the signs of the two coordinates tell which one a point is in. | SCENE | 1 | P1 |
| 08 | **fielders on ground**: Two fielders on a ground are two points: the distance between them comes from the distance formula. | SCENE | 1 | P2 |
| 09 | **equal distance stop**: A point on a road that is equally far from two houses is found by setting two distances equal. | SCENE | 1 | P2 |

### Chapter 8. Introduction to Trigonometry

| ID | Picture | Kind | Files | Priority |
|---|---|---|---|---|
| 01 | **ladder on wall**: A ladder, the wall and the ground make a right triangle: the angle the ladder makes decides how high it reaches. | SCENE | 1 | P1 |
| 02 | **sides change roles**: Which side is opposite and which is adjacent depends on the angle you look from; the hypotenuse stays the same side. | MULTI-VIEW | 2 (f1, f2) | P1 |
| 03 | **nested wedges**: Right triangles with the same angle are similar, so sin, cos and tan depend only on the angle, not on the size. | MULTI-VIEW | 2 (34, front) | P1 |
| 04 | **station ramp**: The steepness of a ramp is a ratio of its rise to its run: the same idea as the tangent of its angle. | SCENE | 1 | P2 |
| 05 | **swinging arm**: As an arm rises from 0 to 90 degrees its height grows from nothing to its full length while its floor shadow shrinks to nothing: sin 0 = 0, cos 0... | SEQUENCE | 4 (f1, f2, f3, f4) | P1 |
| 06 | **set squares**: The two set squares in a geometry box carry all the special angles: 30-60-90 and 45-45-90. | MULTI-VIEW | 2 (34, top) | P1 |
| 07 | **fold the square**: A square folded on its diagonal gives a 45-45-90 triangle with two equal sides: sin 45 = cos 45 and tan 45 = 1. | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 08 | **half a triangle**: Half of an equilateral triangle is a 30-60-90 triangle: the shortest side is half the hypotenuse, giving sin 30 = 1/2 and cos 30 = root 3 over 2. | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 09 | **sand squares**: sin squared plus cos squared equals 1: the squares on the two shorter sides together make the square on the hypotenuse. | SEQUENCE | 2 (f1, f2) | P1 |
| 10 | **knotted rope triangle**: A rope with twelve equal parts pulled into a 3-4-5 triangle gives a true right angle, and sin, cos and tan as simple fractions. | SCENE | 1 | P2 |

### Chapter 9. Some Applications of Trigonometry

| ID | Picture | Kind | Files | Priority |
|---|---|---|---|---|
| 01 | **tall tower**: A tall thing can be measured from the ground without climbing it: its height, our distance from it and the angle we look up make a right triangle. | SCENE | 1 | P1 |
| 02 | **elevation model**: Angle of elevation: the angle between the horizontal line from the eye and the line of sight up to the top of the object. | 3D-MODEL | 1 | P1 |
| 03 | **depression model**: Angle of depression: the angle between the horizontal at the eye and the line of sight down to an object, and it equals the angle of elevation... | SEQUENCE | 2 (f1, f2) | P1 |
| 04 | **clinometer**: A clinometer measures an angle of elevation: sight the top through the straw, and the hanging thread reads the angle on the protractor. | MULTI-VIEW | 3 (34, front, side) | P1 |
| 05 | **sighting the treetop**: Using the clinometer: stand a measured distance away, sight the treetop and read the angle. | SCENE | 1 | P1 |
| 06 | **river bridge**: From a point on a bridge, the angles of depression to the two banks give the river's width: two right triangles share one height. | 3D-CUTAWAY | 1 | P1 |
| 07 | **kite string**: A kite on a taut string: the string is the hypotenuse of a right triangle, the kite's height the opposite side, and the angle of elevation links them. | SCENE | 1 | P1 |
| 08 | **shadow lengths**: The same tower casts a short shadow when the sun is high and a long shadow when the sun is low: shadow length = height divided by the tangent of... | SEQUENCE | 2 (f1, f2) | P1 |
| 09 | **flagstaff on building**: Two angles of elevation from one point, one to the top of a building and one to the top of its flagstaff, give the flagstaff's length. | SCENE | 1 | P2 |
| 10 | **two buildings**: From the top of one building, the angles of depression to the top and to the foot of another building give its height. | SCENE | 1 | P2 |
| 11 | **pole repair**: A ladder against a pole makes a right triangle whose angle with the ground gives how far up the worker reaches. | SCENE | 1 | P2 |

### Chapter 10. Circles

| ID | Picture | Kind | Files | Priority |
|---|---|---|---|---|
| 01 | **wheel on road**: A circle touches a straight line at just one point: a wheel on a road is the everyday picture of a tangent. | SCENE | 1 | P1 |
| 02 | **ring and rod**: A line and a circle can have no common point, touch at exactly one point (tangent) or cross at two points (secant). | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 03 | **spoke to ground**: The tangent at a point is perpendicular to the radius through that point: the spoke to the contact point makes a right angle with the road. | MULTI-VIEW | 2 (34, side) | P1 |
| 04 | **shortest thread**: Every point of a tangent other than the contact point lies outside the circle, so the radius to the contact point is the shortest of all distances... | DIAGRAM-ART | 1 | P2 |
| 05 | **point and tangents**: From a point on the circle there is exactly one tangent, from a point outside exactly two, and from a point inside none. | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 06 | **tangent kite**: The two tangents from an outside point are equal in length: the shape formed with the centre is a kite with two right angles. | MULTI-VIEW | 2 (34, top) | P1 |
| 07 | **well pulley**: Ropes leaving a pulley straight down on both sides are tangents to the wheel. | SCENE | 1 | P2 |
| 08 | **water off the wheel**: A thing leaving a turning wheel flies off along the tangent. | PHOTO | 1 | P2 |
| 09 | **rings and chord**: In two concentric circles, a chord of the large circle that touches the small one is bisected at the point of contact. | 3D-MODEL | 1 | P2 |
| 10 | **round park roads**: Roads around a circular park show all three line-circle cases: one touching (tangent), one cutting through (secant), one passing outside. | SCENE | 1 | P2 |

### Chapter 11. Areas Related to Circles

| ID | Picture | Kind | Files | Priority |
|---|---|---|---|---|
| 01 | **cake slices**: A sector is a slice of a circle: the fraction of the whole is the fraction of the angle. | SCENE | 1 | P1 |
| 02 | **sector discs**: The area of a sector is the angle fraction of the circle's area: 90 degrees takes a quarter, 180 a half. | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 03 | **folding fan**: An open fan is a sector of a circle: its two sticks are radii and its top edge is an arc. | MULTI-VIEW | 2 (34, front) | P1 |
| 04 | **wiper sweep**: The area a wiper sweeps is the difference of two sectors. | SCENE | 1 | P2 |
| 05 | **circle to rectangle**: Cut a circle into many equal sectors and rearrange them: they make an almost rectangle of height r and length half the circumference, so area = pi... | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 06 | **segment pieces**: Area of a segment = area of the sector minus area of the triangle. | 3D-EXPLODED, MULTI-VIEW | 2 (exploded, top) | P1 |
| 07 | **sprinkler lawn**: A sprinkler that turns through an angle waters a sector of the lawn. | SCENE | 1 | P1 |
| 08 | **tethered horse**: A horse tied to a peg at a corner of a square field can graze a quarter circle. | SCENE | 1 | P2 |
| 09 | **clock minute hand**: A minute hand sweeps a sector: in 20 minutes it turns 120 degrees. | 3D-MODEL | 1 | P2 |
| 10 | **tile design**: Designs made from circles and squares are found by adding and subtracting areas. | DIAGRAM-ART | 1 | P2 |

### Chapter 12. Surface Areas and Volumes

| ID | Picture | Kind | Files | Priority |
|---|---|---|---|---|
| 01 | **camp tent**: Many everyday objects are two or more simple solids joined: a tent is a cylinder with a cone on top. | SCENE | 1 | P1 |
| 02 | **capsule solid**: A capsule is a cylinder with a hemisphere on each end; its surface area adds the curved surface of the cylinder and two half spheres. | 3D-EXPLODED, 3D-MODEL | 3 (34, exploded, front) | P1 |
| 03 | **tent canvas solid**: Canvas of a tent covers only the curved surface of the cylinder and of the cone: the base and the joint are not canvas. | 3D-CUTAWAY, 3D-EXPLODED, 3D-MODEL | 3 (34, cut, exploded) | P1 |
| 04 | **ice cream cone**: An ice-cream cone with a round scoop on top: volume is the cone plus a hemisphere. | 3D-CUTAWAY, 3D-MODEL | 2 (cut, front) | P1 |
| 05 | **spinning top**: A spinning top (lattu) is a hemisphere with a cone: surface area is two curved surfaces, and the flat joint is hidden. | 3D-EXPLODED, 3D-MODEL | 2 (34, exploded) | P1 |
| 06 | **cube and dome**: A decorative block is a cube with a hemisphere on top: its surface area is the cube's six faces, less the circle the dome covers, plus the dome's... | 3D-EXPLODED, 3D-MODEL | 3 (34, exploded, top) | P2 |
| 07 | **bird bath**: A bird bath is a cylinder with a hemispherical bowl scooped out: take away the flat circle, add the bowl's curved surface. | 3D-CUTAWAY, 3D-MODEL | 2 (34, cut) | P2 |
| 08 | **factory shed**: A shed is a cuboid with a half cylinder on top: the surface to cover is the four walls and the curved roof, not the floor or the join. | 3D-EXPLODED, 3D-MODEL | 3 (34, exploded, front) | P2 |
| 09 | **juice glass**: A glass with a hemispherical lump rising from its base holds less juice than a plain cylinder: capacity = cylinder volume minus hemisphere volume. | 3D-CUTAWAY | 1 | P1 |
| 10 | **cone fills cylinder**: A cone with the same base and height as a cylinder holds exactly one third of it: three cones of sand fill the cylinder. | SEQUENCE | 4 (f1, f2, f3, f4) | P1 |
| 11 | **cone and dome fill cylinder**: With equal radius r, a cone of height r and a hemisphere together fill a cylinder of radius r and height r: 1/3 + 2/3 = 1. | SEQUENCE | 2 (f1, f2) | P2 |
| 12 | **rooftop water tank**: A storage tank is a cylinder with a dome (hemisphere or cone) lid: another everyday combination of solids. | SCENE | 1 | P2 |

### Chapter 13. Statistics

| ID | Picture | Kind | Files | Priority |
|---|---|---|---|---|
| 01 | **reading corner**: Data come from real groups and activities: a class's reading choices are counted before they are organised. | SCENE | 1 | P2 |
| 02 | **marble tubes**: Grouped data: the range is cut into classes of equal width and each class has a frequency, the count in it. | DIAGRAM-ART | 1 | P1 |
| 03 | **sorting pencils**: Raw data are sorted from smallest to largest, then placed in classes of equal width. | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 04 | **mean balance point**: The mean is the balance point of the data: weight placed at each value balances exactly there. | SEQUENCE | 2 (f1, f2) | P1 |
| 05 | **levelling coins**: The mean is what each would have if the total were shared out equally: take from the tall stacks and give to the short ones until all are level. | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 06 | **rope at assumed mean**: Assumed mean method: pick a convenient level, measure each value's gap above or below it, and correct by the average gap. | SEQUENCE | 2 (f1, f2) | P2 |
| 07 | **shoe shop shelves**: The mode is the most frequent value: the shoe size with the largest stock. | SCENE | 1 | P1 |
| 08 | **modal class columns**: Mode of grouped data: the modal class is the one with the highest frequency, and its neighbours' frequencies pull the mode within that class. | DIAGRAM-ART | 1 | P1 |
| 09 | **median poles**: The median is the middle value of the data arranged in order: equal numbers lie below and above it. | DIAGRAM-ART | 1 | P1 |
| 10 | **cumulative staircase**: Cumulative frequency adds the counts class by class; the median class is the one where the running total passes half of all. | SEQUENCE | 3 (f1, f2, f3) | P1 |
| 11 | **nursery saplings**: Real data in grouped form: the heights of plants in a nursery fall into height classes. | SCENE | 1 | P2 |

### Chapter 14. Probability

| ID | Picture | Kind | Files | Priority |
|---|---|---|---|---|
| 01 | **coin toss**: Tossing a coin has two outcomes that are equally likely: the picture of chance before a cricket match. | SCENE | 1 | P1 |
| 02 | **coin faces**: A coin has two faces, head and tail, which are the two possible outcomes. | 3D-MODEL | 2 (head, tail) | P1 |
| 03 | **fair die**: A fair die has six faces, each equally likely, and opposite faces add up to 7. | 3D-MODEL, DIAGRAM-ART | 3 (34-back, 34, net) | P1 |
| 04 | **six dice outcomes**: The sample space of one die: six outcomes, each one the top face, all equally likely. | DIAGRAM-ART | 1 | P1 |
| 05 | **bag of balls**: Favourable outcomes over all outcomes: a bag of 3 red, 5 blue and 2 green balls gives P(red) = 3/10, and P(not red) is the rest. | 3D-MODEL, DIAGRAM-ART | 2 (34, top) | P1 |
| 06 | **deck of cards**: A deck has 52 cards: 4 suits of 13, with 12 face cards, 4 aces and 26 red cards. | 3D-MODEL, DIAGRAM-ART | 3 (34, face, top) | P1 |
| 07 | **two dice grid**: Two dice have 36 equally likely outcomes, which makes a six-by-six table of pairs. | DIAGRAM-ART | 1 | P1 |
| 08 | **all red bag**: A sure event has probability 1: from a bag with only red balls, a red ball is certain, and a blue ball is impossible. | SCENE | 1 | P1 |
| 09 | **mela spinner**: Outcomes are equally likely only when the sectors are equal: a fair spinner and an unfair one. | 3D-MODEL | 2 (fair, unfair) | P2 |
| 10 | **tennis court**: When two outcomes cover everything, P(win) + P(lose) = 1. | SCENE | 1 | P2 |
| 11 | **lake in the farmland**: Chance can be a fraction of area: a missing object is equally likely anywhere in the region. | SCENE | 1 | P2 |
| 12 | **name slips bowl**: Choosing one of many identical slips is a fair random choice: each slip equally likely. | SCENE | 1 | P2 |
