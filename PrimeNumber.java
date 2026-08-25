import java.util.Scanner;

/**
 * Prime Number Program
 * Demonstrates:
 *  1. Checking if a number is prime (optimized O(sqrt(n)) trial division)
 *  2. Printing all primes up to N using the Sieve of Eratosthenes
 */
public class PrimeNumber {

    /**
     * Checks whether n is a prime number.
     * Optimized: only tests divisors up to sqrt(n), skipping even numbers.
     * Time complexity: O(sqrt(n))
     */
    public static boolean isPrime(long n) {
        // Numbers less than 2 are not prime
        if (n < 2) {
            return false;
        }
        // 2 is the only even prime
        if (n == 2) {
            return true;
        }
        // Eliminate all other even numbers
        if (n % 2 == 0) {
            return false;
        }
        // Test odd divisors up to sqrt(n)
        for (long i = 3; i * i <= n; i += 2) {
            if (n % i == 0) {
                return false;
            }
        }
        return true;
    }

    /**
     * Prints all primes up to limit using the Sieve of Eratosthenes.
     * Time complexity: O(n log log n)
     */
    public static void sieveOfEratosthenes(int limit) {
        if (limit < 2) {
            System.out.println("No primes exist below 2.");
            return;
        }

        boolean[] composite = new boolean[limit + 1];

        for (int p = 2; (long) p * p <= limit; p++) {
            if (!composite[p]) {
                // Mark all multiples of p as composite
                for (int multiple = p * p; multiple <= limit; multiple += p) {
                    composite[multiple] = true;
                }
            }
        }

        System.out.print("Primes up to " + limit + ": ");
        int count = 0;
        for (int i = 2; i <= limit; i++) {
            if (!composite[i]) {
                System.out.print(i + " ");
                count++;
            }
        }
        System.out.println("\nTotal primes found: " + count);
    }

    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.println("=== Prime Number Checker ===");
        System.out.print("Enter an integer: ");

        long number = scanner.nextLong();

        if (isPrime(number)) {
            System.out.println(number + " is a PRIME number.");
        } else {
            System.out.println(number + " is NOT a prime number.");
        }

        System.out.println();
        sieveOfEratosthenes(100); // Demo: list primes up to 100

        scanner.close();
    }
}
