@.s = private unnamed_addr constant [6 x i8] c"hello\00"
declare i32 @puts(ptr)
define i32 @main() {
  call i32 @puts(ptr @.s)
  ret i32 0
}
