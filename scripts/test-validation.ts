
import { validateCoinbasePrice } from "@/lib/billing/validation";

console.log("Running Validation Tests...");

const tests = [
    {
        name: "Pro Monthly Exact",
        planId: "pro",
        interval: "month",
        amount: 2900,
        expectedValid: true
    },
    {
        name: "Pro Monthly Mismatch",
        planId: "pro",
        interval: "month",
        amount: 2800,
        expectedValid: false
    },
    {
        name: "Pro Yearly Exact",
        planId: "pro",
        interval: "year",
        amount: 2500 * 12, // 30000
        expectedValid: true
    },
    {
        name: "Premium Monthly Exact",
        planId: "premium",
        interval: "month",
        amount: 9900,
        expectedValid: true
    },
    {
        name: "Unknown Plan",
        planId: "infinite",
        interval: "month",
        amount: 999999,
        expectedValid: false
    }
];

let failures = 0;

tests.forEach(test => {
    const result = validateCoinbasePrice(test.planId, test.interval, test.amount);
    if (result.isValid === test.expectedValid) {
        console.log(`✅ ${test.name}: Passed`);
    } else {
        console.error(`❌ ${test.name}: Failed. Expected ${test.expectedValid} but got ${result.isValid} (Msg: ${result.error})`);
        failures++;
    }
});

if (failures > 0) {
    console.error(`\n${failures} tests failed.`);
    process.exit(1);
} else {
    console.log("\nAll tests passed!");
}
