// Struct-like pattern in OpenSCAD using vectors + constructor/accessor functions
// Response 2: https://www.reddit.com/r/openscad/comments/1sw9yb4/structs_in_openscad/

PERSON_NAME = 0;
PERSON_AGE  = 1;

function person(name, age = 42) = [name, age];

function person_name(p) = p[PERSON_NAME];
function person_age(p)  = p[PERSON_AGE];

// "Update" by returning a new record, not mutating the old one.
function person_with_age(p, age) =
    [person_name(p), age];

people = [
    person("Bob",   20),
    person("Alice", 30),
    person("Fred",   0),
    person("Ann",   40),
    person("Jon")
];

for (p = people)
    echo(str(person_name(p), " is ", person_age(p)));

s  = person("Sean", 50);
echo(person_name(s));

sp = person_with_age(s, 51);
echo(person_age(sp));

// Should return:
// ECHO: "Bob is 20"
// ECHO: "Alice is 30"
// ECHO: "Fred is 0"
// ECHO: "Ann is 40"
// ECHO: "Jon is 42"
// ECHO: "Sean"
// ECHO: 51