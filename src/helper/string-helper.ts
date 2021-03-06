export class StringHelper {
    static roundToFixed(value?: number, fractionDigits = 1): string | null {
        if (value == null) {
            return null;
        }

        const factor = Math.pow(10, fractionDigits);

        return (Math.round((value + Number.EPSILON) * factor) / factor).toFixed(
            fractionDigits
        );
    }
}
