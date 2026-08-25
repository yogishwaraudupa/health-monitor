/*
 Newton's Forward Interpolation

 Used to estimate the value of a function at a point x,
 given a set of equally spaced data points (x, y).

 Formula:
     p = (x - x0) / h
     f(x) = y0 + p*Δy0 + p(p-1)/2! * Δ²y0 + p(p-1)(p-2)/3! * Δ³y0 + ...

 where Δ is the forward difference operator and h is the step size.
*/

#include <iostream>
#include <vector>
#include <iomanip>
#include <stdexcept>
#include <cmath>

using namespace std;

vector<vector<double>> buildDifferenceTable(const vector<double>& y) {
    int n = y.size();
    vector<vector<double>> table(n, vector<double>(n, 0.0));
    for (int i = 0; i < n; i++) {
        table[i][0] = y[i];
    }
    // Compute successive forward differences column by column
    for (int j = 1; j < n; j++) {
        for (int i = 0; i < n - j; i++) {
            table[i][j] = table[i + 1][j - 1] - table[i][j - 1];
        }
    }
    return table;
}

long long factorial(int n) {
    long long result = 1;
    for (int k = 2; k <= n; k++) {
        result *= k;
    }
    return result;
}

double newtonForwardInterpolation(const vector<double>& x, const vector<double>& y, double x_value) {
    int n = x.size();
    if (n != (int)y.size()) {
        throw invalid_argument("x and y must have the same length");
    }
    if (n < 2) {
        throw invalid_argument("At least two data points are required");
    }

    double h = x[1] - x[0];
    // Verify equal spacing
    for (int i = 1; i < n - 1; i++) {
        if (fabs((x[i + 1] - x[i]) - h) > 1e-9) {
            throw invalid_argument("Data points must be equally spaced");
        }
    }

    double p = (x_value - x[0]) / h;

    vector<vector<double>> diff_table = buildDifferenceTable(y);

    double result = y[0];
    double term = 1.0;
    for (int j = 1; j < n; j++) {
        term *= (p - (j - 1)); // p, p(p-1), p(p-1)(p-2), ...
        result += (term / factorial(j)) * diff_table[0][j];
    }

    return result;
}

void printDifferenceTable(const vector<double>& x, const vector<double>& y) {
    int n = y.size();
    vector<vector<double>> table = buildDifferenceTable(y);

    // Print headers
    cout << setw(10) << "x" << " | " << setw(10) << "y";
    for (int j = 1; j < n; j++) {
        string header = "d^" + to_string(j) + "y";
        cout << " | " << setw(10) << header;
    }
    cout << endl;
    cout << string(13 * n, '-') << endl;

    for (int i = 0; i < n; i++) {
        cout << setw(10) << x[i] << " | " << setw(10) << table[i][0];
        for (int j = 1; j < n - i; j++) {
            cout << " | " << setw(10) << fixed << setprecision(2) << table[i][j];
            // reset formatting for next iteration's width
            cout.unsetf(ios::floatfield);
        }
        cout << endl;
    }
}

int main() {
    // Example: equally spaced data points
    vector<double> x = {0, 1, 2, 3, 4};
    vector<double> y = {1, 8, 27, 64, 125}; // f(x) = x^3 -> (x+1)^3? actually 0^3=0, but example uses 1,8,27...

    printDifferenceTable(x, y);

    double x_value;
    cout << "Enter the value of x to interpolate: ";
    cin >> x_value;

    try {
        double result = newtonForwardInterpolation(x, y, x_value);
        cout << "Interpolated value at x = " << x_value << ": "
             << fixed << setprecision(6) << result << endl;
    } catch (const exception& e) {
        cerr << "Error: " << e.what() << endl;
        return 1;
    }

    return 0;
}
