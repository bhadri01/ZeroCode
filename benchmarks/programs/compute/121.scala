object main {
  def main(args: Array[String]): Unit = {
    val n = scala.io.StdIn.readLine().trim.toLong
    var s = 0L; val m = 4294967291L
    var i = 1L
    while (i <= n) { s = (s * 1000003 + i) % m; i += 1 }
    println(s)
  }
}
