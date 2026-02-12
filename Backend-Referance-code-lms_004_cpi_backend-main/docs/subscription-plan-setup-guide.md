# Subscription Plan Setup Guide

## Step-by-Step Instructions

### 1. Create Product in Stripe Dashboard

1. Go to Stripe Dashboard → Products
2. Click "Add Product"
3. Product Name: `Premium Subscription`
4. Description: `Unlimited access to all Discipleship Foundation courses`
5. Save the product

### 2. Create Monthly Price

1. In the product page, click "Add another price"
2. Pricing Model: `Standard pricing`
3. Price: Enter your monthly amount (e.g., `29.99`)
4. Billing Period: `Monthly`
5. Click "Add price"
6. **Copy the Price ID** (starts with `price_`)

### 3. Create Yearly Price

1. Still in the product page, click "Add another price"
2. Pricing Model: `Standard pricing`
3. Price: Enter your yearly amount (e.g., `299.99`)
4. Billing Period: `Yearly`
5. Click "Add price"
6. **Copy the Price ID** (starts with `price_`)

### 4. Calculate Values

**Example Calculation (if monthly = $29.99, yearly = $299.99):**

- Monthly amount in cents: `2999` (29.99 × 100)
- Yearly amount in cents: `29999` (299.99 × 100)
- Monthly equivalent: `2499` (29999 ÷ 12 = 2499.92, rounded to 2499)
- Savings percent: `17%` (calculated: ((2999 × 12) - 29999) / (2999 × 12) × 100 = 16.67%, rounded to 17)

### 5. Insert into MongoDB

**Option A: Using MongoDB Compass**

1. Connect to your database
2. Navigate to `subscriptionplans` collection
3. Click "Add Data" → "Insert Document"
4. Paste the JSON from `subscription-plan-seed.json`
5. Replace the `REPLACE_WITH_*` placeholders with actual Stripe Price IDs
6. Update amounts if different
7. Click "Insert"

**Option B: Using MongoDB Shell**

1. Connect to MongoDB: `mongosh "your-connection-string"`
2. Use your database: `use your-database-name`
3. Copy the command from `subscription-plan-mongodb-insert.js`
4. Replace placeholders with actual values
5. Paste and execute

**Option C: Using Mongoose in Node.js**

```javascript
const { SubscriptionPlan } = require('./models/common/subscription_plan_model')

async function seedPlan() {
	await SubscriptionPlan.create({
		name: { en: 'Premium', es: 'Premium' },
		description: {
			en: 'Get unlimited access to all Discipleship Foundation courses...',
			es: 'Obtén acceso ilimitado a todos los cursos...',
		},
		features: [
			{ en: 'Access to all 5 Discipleship Foundation courses', es: '...' },
			// ... rest of features
		],
		monthly: {
			stripePriceId: 'price_xxxxx', // Your monthly price ID
			amount: 2999,
			currency: 'usd',
		},
		yearly: {
			stripePriceId: 'price_yyyyy', // Your yearly price ID
			amount: 29999,
			currency: 'usd',
			monthlyEquivalent: 2499,
			savingsPercent: 17,
		},
		isActive: true,
	})
}
```

### 6. Verify

1. Check that the plan was inserted: `db.subscriptionplans.find()`
2. Test the API endpoint: `GET /api/v1/app/subscription/plan`
3. Should return the plan with all features and pricing

## Important Notes

- **Amounts are in cents**: $29.99 = 2999 cents
- **Stripe Price IDs are required**: You must create prices in Stripe first
- **Only one active plan**: Make sure `isActive: true` for the plan you want to use
- **Multilingual support**: Both `en` and `es` fields are required for name, description, and features
