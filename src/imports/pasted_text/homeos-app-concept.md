Context

Design a premium mobile-first financial planning application called HomeOS (working title).

This is NOT another Splitwise clone.

The purpose of the app is to help couples, roommates, families or any shared household manage money together while preserving each person's financial independence.

The app should feel like an operating system for a household rather than an expense tracker.

The primary KPI is Household Financial Health, not "who owes who."

The experience should encourage collaboration, transparency, planning and shared goals instead of debt collection.

Design principles

The interface should feel:

Premium
Minimal
Calm
Trustworthy
Friendly
Modern

Inspired by

Apple Wallet
Copilot Money
Monzo
Linear
Notion
Mercury Bank

Avoid looking like spreadsheets or accounting software.

Instead use:

rounded cards
generous whitespace
subtle illustrations
beautiful progress bars
soft charts
friendly empty states
meaningful data visualization

Everything should feel emotionally positive because finances are often stressful.

Core Philosophy

The application manages three different layers of money.

Personal

Money that belongs only to one person.

Examples:

salary
savings
subscriptions
medical expenses
car payments
retirement funds
insurance
Household

Money everyone contributes to.

Examples

rent
internet
groceries
utilities
cleaning
transportation
pets
Shared Goals

Money intentionally saved together.

Examples

emergency fund
buying a house
vacations
furniture
wedding
baby
investment

Users should clearly understand which money belongs where.

The innovation

Instead of splitting expenses only by percentage or 50/50, introduce the concept of

Contribution Capacity

Every member can choose one of three contribution models.

Option 1

Split equally.

50 / 50

(or any custom percentage)

Option 2

Split proportionally according to income.

Example

Diana

Income

$69,000 MXN

Carlos

Income

$30,000 MXN

Household expenses are automatically divided according to each person's income percentage.

Option 3 (Recommended)

Contribution Capacity

Instead of using gross income, calculate how much money is realistically available after each person's fixed personal commitments.

Formula

Income

minus

Personal fixed expenses

equals

Contribution Capacity

Example

Diana

Salary

$69,000

Personal obligations

Car payment

Insurance

Medical

Retirement fund

Subscriptions

Available contribution

$48,000

Carlos

Salary

$30,000

Personal obligations

$5,000

Available contribution

$25,000

Household expenses should be divided using the available contribution rather than gross salary.

Explain visually why this feels fairer.

Allow users to change this setting anytime.

Personal Expenses

Allow users to create recurring personal expenses.

Examples

Housing

Health

Transportation

Insurance

Retirement

Education

Debt

Subscriptions

Pets

Savings

Investments

Examples of Health

therapy
psychologist
dermatologist
gynecologist
dentist
medication
gym
supplements
medical tests

Health deserves its own category instead of being hidden under "Other."

Dashboard

Design the first screen.

Show

Good morning Diana 👋

Household

Apartment

Financial Health Score

Excellent

92 / 100

Monthly Budget

Spent

Remaining

Emergency Fund

Next Bills

Upcoming Goals

Contribution Summary

Recent Activity

Avoid showing debt first.

Show progress first.

Budget Module

Budget should be category based.

Each category has

Budget

Spent

Remaining

Forecast

Trend compared to last month

Suggested budget for next month

If the household consistently exceeds a category,

recommend automatically increasing its budget.

If they consistently spend less,

recommend reducing it.

Use AI-generated insights.

Examples

"You spent 18% more on restaurants this month."

"Cleaning expenses have remained stable for six months."

"If this trend continues you'll save enough for your vacation in October."

Goals

Goals should feel inspiring.

Each goal includes

Image

Progress

Target amount

Monthly contribution

Estimated completion date

Members contributing

Examples

Emergency Fund

Japan Trip

House Down Payment

New Sofa

Dog Emergency Fund

Christmas

Baby Fund

Multiple Spaces

A user can have multiple shared spaces.

Apartment

Vacation

Wedding

Baby

Business

Trip with friends

Parents

Each space has

Members

Budgets

Expenses

Goals

Rules

Timeline

Household Timeline

Show a beautiful activity feed.

Examples

Carlos paid Internet

Diana bought groceries

Emergency fund reached 25%

Rent paid

Budget exceeded in Restaurants

Vacation goal completed

Smart Insights

The app should proactively help.

Examples

You can safely increase your emergency savings next month.

Restaurants exceeded the budget three consecutive months.

Your emergency fund covers 4.2 months.

If Diana loses her freelance income the household remains sustainable for 7 months.

Recurring Expenses

Allow recurring expenses with frequencies

Weekly

Biweekly

Monthly

Bimonthly

Quarterly

Semiannual

Annual

Custom

Automatically calculate monthly averages.

For example

Gas

$1,000

Every six months

Display

Monthly impact

$167/month

instead of showing zero most months.

Realistic Household Scenario

Use the following example household while generating the UI.

Household

Apartment

Members

Diana

Carlos

Household recurring expenses

Rent

$20,000/month

Internet

$700/month

Electricity

$300 every two months

Gas

$1,000 every six months

Cleaning

$1,000/month

Groceries

$4,000/month

Restaurants & Entertainment

$6,000/month

Gasoline

$1,000/month

Tolls

$500/month

Diana

Income

Salary

$40,000/month

Freelance

$29,000/month

Emergency Savings

$120,000

Automatic company savings

20%

Personal recurring expenses

Car payment

$12,000/month

Health Insurance

$1,702/month

Retirement Fund

$2,414/month

Therapy

$800/month

Medical Expenses

$1,000/month

Deezer

$240/month

Google

$169/month

YouTube Premium

$280/month

Mobile

$70/month

Pets

$2,000/month

Annual subscriptions

Amazon

American Express

Nintendo

Interaction Design Foundation

Carlos

Income

Freelance

$30,000/month

Emergency Savings

None

Allow users to configure his recurring expenses later.

Financial Health Score

Create a score from 0 to 100 considering

Emergency fund

Savings rate

Budget adherence

Recurring expenses

Income stability

Goal progress

Debt ratio

Contribution consistency

Display

Excellent

Healthy

Attention

Risk

Future Features

Design with scalability.

Future modules may include

Investment tracking

Net worth

Mortgage simulator

Buying a home simulator

Tax estimation

AI financial coach

Bank synchronization

Receipt scanning

Automatic categorization

Financial calendar

Family permissions

Children allowances

Widgets

Apple Watch

Android widgets

Navigation

Bottom navigation

Home

Budget

Goals

Household

Activity

Floating Action Button

Add Expense

UX Tone

The application should never make users feel guilty.

Instead of saying

"You overspent."

Say

"You're $850 above your planned budget. Would you like to adjust next month's plan?"

Instead of

"You owe Carlos."

Say

"Carlos has temporarily covered this expense. You can settle it whenever it's convenient."

The app should always promote collaboration instead of conflict.

Un par de ideas que añadiría (y que creo que son el verdadero diferenciador)

Hay tres funcionalidades que no he visto bien resueltas en ninguna app y que podrían convertirse en el corazón del producto:

🌱 1. Simulación antes de tomar decisiones

Antes de cambiar algo, el hogar puede hacer simulaciones:

¿Qué pasa si cambiamos a un departamento de $25,000?
¿Qué pasa si compramos un segundo coche?
¿Qué pasa si uno deja de trabajar 3 meses?
¿Qué pasa si llega un bebé?

La app recalcula automáticamente presupuestos, aportaciones, ahorro y tiempo para alcanzar metas.

📈 2. Presupuesto adaptable

En lugar de reiniciar cada mes, la app aprende.

Si durante seis meses el presupuesto de supermercado fue de $4,000 pero siempre terminan gastando $5,200, propone:

"Tu presupuesto real para supermercado parece ser de aproximadamente $5,200. ¿Quieres actualizarlo automáticamente a partir del próximo mes?"

Eso hace que el presupuesto evolucione con la vida real.

❤️ 3. Bienestar financiero

No solo medir dinero.

Medir tranquilidad.

Por ejemplo:

Meses que podrían vivir sin ingresos.
Qué porcentaje del ingreso ya está comprometido antes de iniciar el mes.
Qué tan equilibradas son las aportaciones entre los integrantes.
Qué tan cerca están de sus objetivos.
Si existe riesgo financiero por depender demasiado del ingreso de una sola persona.