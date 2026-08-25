"""
Newton's Forward Interpolation

Used to estimate the value of a function at a point x,
given a set of equally spaced data points (x, y).

Formula:
    p = (x - x0) / h
    f(x) = y0 + p*Δy0 + p(p-1)/2! * Δ²y0 + p(p-1)(p-2)/3! * Δ³y0 + ...

where Δ is the forward difference operator and h is the step size.
"""


def build_difference_table(y):
    """Build the forward difference table.

    Args:
        y: list of equally spaced y-values

    Returns:
        A 2D list where table[i][j] is the j-th forward difference of y[i].
    """
    n = len(y)
    table = [[0.0] * n for _ in range(n)]
    for i in range(n):
        table[i][0] = y[i]

    # Compute successive forward differences column by column
    for j in range(1, n):
        for i in range(n - j):
            table[i][j] = table[i + 1][j - 1] - table[i][j - 1]

    return table


def factorial(n):
    result = 1
    for k in range(2, n + 1):
        result *= k
    return result


def newton_forward_interpolation(x, y, x_value):
    """Interpolate f(x_value) using Newton's forward difference formula.

    Args:
        x: list of equally spaced x-values (ascending)
        y: corresponding y-values
        x_value: the point at which to estimate the function

    Returns:
        The interpolated value.
    """
    n = len(x)
    if n != len(y):
        raise ValueError("x and y must have the same length")
    if n < 2:
        raise ValueError("At least two data points are required")

    h = x[1] - x[0]
    # Verify equal spacing
    for i in range(1, n - 1):
        if abs((x[i + 1] - x[i]) - h) > 1e-9:
            raise ValueError("Data points must be equally spaced")

    p = (x_value - x[0]) / h

    diff_table = build_difference_table(y)

    result = y[0]
    term = 1.0
    for j in range(1, n):
        term *= (p - (j - 1))          # p, p(p-1), p(p-1)(p-2), ...
        result += (term / factorial(j)) * diff_table[0][j]

    return result


def print_difference_table(x, y):
    """Pretty-print the forward difference table."""
    n = len(y)
    table = build_difference_table(y)
    headers = ["x", "y"] + [f"Δ^{j}y" for j in range(1, n)]
    print(" | ".join(f"{h:>10}" for h in headers))
    print("-" * (13 * n))
    for i in range(n):
        row = [f"{x[i]:>10}", f"{table[i][0]:>10}"]
        for j in range(1, n - i):
            row.append(f"{table[i][j]:>10}")
        print(" | ".join(row))


if __name__ == "__main__":
    # Example: equally spaced data points
    x = [0, 1, 2, 3, 4]
    y = [1, 8, 27, 64, 125]   # f(x) = x^3

    print_difference_table(x, y)

    x_value = float(input("Enter the value of x to interpolate: "))
    result = newton_forward_interpolation(x, y, x_value)
    print(f"Interpolated value at x = {x_value}: {result:.6f}")