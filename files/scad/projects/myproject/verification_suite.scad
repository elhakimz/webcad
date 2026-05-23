// WebCAD Verification Suite for SCAD stack fixes

// 1. Modulo & Exponentiation Operators
echo("1. Modulo & Exponentiation test:");
echo("5 % 3 =", 5 % 3);          // Expected: 2
echo("2 ^ 3 =", 2 ^ 3);          // Expected: 8
echo("2 ^ 3 ^ 2 =", 2 ^ 3 ^ 2);  // Expected: 512 (Right-associativity 2^(3^2))
assert(5 % 3 == 2, "Modulo % failed");
assert(2 ^ 3 == 8, "Exponentiation ^ failed");
assert(2 ^ 3 ^ 2 == 512, "Right-associative exponentiation failed");

// 2. Built-in Math Functions
echo("2. Math built-ins test:");
echo("norm([3, 4]) =", norm([3, 4]));               // Expected: 5
echo("cross([1,0,0], [0,1,0]) =", cross([1,0,0], [0,1,0])); // Expected: [0, 0, 1]
echo("lookup(2.5, [[1,10],[2,20],[3,30]]) =", lookup(2.5, [[1,10],[2,20],[3,30]])); // Expected: 25
echo("chr([72, 69, 76, 76, 79]) =", chr([72, 69, 76, 76, 79])); // Expected: "HELLO"
echo("ord('A') =", ord("A"));                       // Expected: 65
echo("is_function(1) =", is_function(1));           // Expected: false
echo("rands(0, 10, 3) =", rands(0, 10, 3));         // Expected: array of 3 random numbers

assert(norm([3, 4]) == 5, "norm() failed");
assert(cross([1,0,0], [0,1,0]) == [0, 0, 1], "cross() failed");
assert(lookup(2.5, [[1,10],[2,20],[3,30]]) == 25, "lookup() failed");
assert(chr([72, 69, 76, 76, 79]) == "HELLO", "chr() failed");
assert(ord("A") == 65, "ord() failed");

// 3. Loop Variable & List Single-Element Support
echo("3. Loop variable single-element test:");
for (i = 42) {
    echo("For loop single item i =", i);
    assert(i == 42, "Single-element for loop failed");
}
comp_result = [ for (x = 99) x ];
echo("List comp single item =", comp_result);
assert(comp_result == [99], "Single-element list comprehension failed");

// 4. Modifiers Desugaring (*, %, !, #)
echo("4. Shape modifiers desugaring test (renders transparent color/debug overlays):");
*cube(1);         // Discarded (disabled modifier)
%sphere(r=2);     // Transparent gray ghost
#cylinder(r=1,h=3); // Transparent hot pink highlighting

// 5. Torus Primitive execution
echo("5. Torus primitive creation:");
torus(r1=10, r2=2);

// 6. Real linear_extrude using boundary points
echo("6. Real mathematical linear_extrude:");
linear_extrude(height=5, center=true) {
    square(size=[4, 4], center=true);
}

// 7. rotate_extrude using mapped profile points
echo("7. rotate_extrude profile mapping:");
rotate_extrude(angle=270, $fn=64) {
    translate(v=[5, 0, 0]) {
        circle(r=2, $fn=16);
    }
}
