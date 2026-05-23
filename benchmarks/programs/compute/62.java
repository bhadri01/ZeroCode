import java.util.Scanner;
public class Main {
  public static void main(String[] a){
    Scanner sc=new Scanner(System.in);
    long n=sc.nextLong(), s=0, M=4294967291L;
    for(long i=1;i<=n;i++) s=(s*1000003+i)%M;
    System.out.println(s);
  }
}
