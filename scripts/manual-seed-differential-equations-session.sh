#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <topic_id>"
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set."
  exit 1
fi

TOPIC_ID="$1"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v topic_id="$TOPIC_ID" <<'SQL'
DO $seed$
DECLARE
  v_topic record;
  v_material_id text := 'manual_material_' || substr(md5(clock_timestamp()::text || random()::text), 1, 18);
  v_framework_id text;
  v_active_framework_version_id text;
  v_latest_framework_version_id text;
  v_latest_framework_version_number integer;
  v_seeded_profiles integer := 0;
  v_pack_version integer := 1;
BEGIN
  SELECT
    id,
    classroom_id,
    course_id,
    created_by_user_id,
    title,
    subject_key,
    source_boundary,
    topic_grounding_pack
  INTO v_topic
  FROM learning_topics
  WHERE id = :'topic_id';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Topic % was not found.', :'topic_id';
  END IF;

  v_pack_version := COALESCE((v_topic.topic_grounding_pack->>'version')::integer, 0) + 1;

  DELETE FROM topic_material_upload_attempts
  WHERE topic_id = v_topic.id;

  INSERT INTO topic_materials (
    id,
    topic_id,
    uploaded_by_user_id,
    title,
    description,
    material_kind,
    storage_bucket,
    storage_path,
    public_url,
    mime_type,
    size_bytes,
    extraction_status,
    extraction_error,
    indexing_status,
    indexing_error,
    extracted_text,
    source_document,
    grounding_map,
    coverage_review,
    analysis,
    created_at,
    updated_at
  ) VALUES (
    v_material_id,
    v_topic.id,
    v_topic.created_by_user_id,
    'Differential Equations - Senior 5 Content Guide',
    'Emergency manual insert while tutoring upload is failing in production.',
    'text',
    NULL,
    NULL,
    NULL,
    'text/plain',
    length($content$
Differential Equations Senior 5 Content Guide
Curriculum Level: Senior 5 (Advanced Level Mathematics)
Prerequisites: Differentiation, Integration, Algebra, Functions

Learning Outcomes Addressed
LO1: Conceptualize the mechanics and purpose of standard differential equation formulas
LO2: Solve applied problems by correctly selecting and executing given formulas
LO3: Construct novel solutions by deriving techniques from established formulas

Table of Contents
1. What Is a Differential Equation?
2. Key Terminology and Classification
3. General and Particular Solutions
4. Forming Differential Equations
5. Method 1 - Direct Integration
6. Method 2 - Separation of Variables
7. Method 3 - Homogeneous Equations
8. Method 4 - First-Order Linear Equations (Integrating Factor)
9. Applications of Differential Equations
10. Worked Examples Bank
11. Common Mistakes and Pitfalls
12. Summary of All Key Formulas

1. What Is a Differential Equation?
A differential equation is an equation that contains an unknown function and one or more of its derivatives.
It describes a relationship between a quantity and how that quantity changes.
Example: dy/dx = 2y.
Solving the equation means finding the function y(x) that satisfies the rule.

2. Key Terminology and Classification
Order is the highest derivative appearing in the equation.
Degree is the power of the highest-order derivative once written in polynomial form.
Senior 5 focuses mainly on first-order ordinary differential equations.
Linear equations contain y and its derivatives only to the first power and without products between y and derivatives.
Homogeneous first-order equations can be written in the form dy/dx = f(y/x).

3. General and Particular Solutions
A general solution contains arbitrary constants and represents a family of curves.
A particular solution is obtained after applying initial conditions.
Example: if dy/dx = 2x, then y = x^2 + C.
If y(0) = 5, then the particular solution is y = x^2 + 5.

4. Forming Differential Equations
To form a differential equation from a family of curves, differentiate enough times to eliminate the arbitrary constants.
Example: y = A e^(3x) leads to dy/dx = 3y.

5. Method 1 - Direct Integration
Use direct integration when the equation can be written as dy/dx = f(x).
Then y = integral of f(x) dx plus C.
Example: if dy/dx = 4/x, then y = 4 ln|x| + C.

6. Method 2 - Separation of Variables
Use this method when all y terms can be moved to one side and all x terms to the other:
g(y) dy = f(x) dx.
Integrate both sides and then apply any initial conditions.
Example: dy/dx = xy becomes dy/y = x dx, so ln|y| = x^2 / 2 + C.

7. Method 3 - Homogeneous Equations
If dy/dx = f(y/x), use the substitution y = vx, so dy/dx = v + x dv/dx.
This transforms the equation into a separable equation in v and x.
After solving, replace v with y/x.

8. Method 4 - First-Order Linear Equations (Integrating Factor)
Standard form: dy/dx + P(x)y = Q(x).
Integrating factor: mu(x) = e^(integral of P(x) dx).
Then d/dx[mu(x) y] = mu(x) Q(x), which can be integrated directly.

9. Applications of Differential Equations
Exponential growth and decay: dy/dt = ky with solution y = y0 e^(kt).
Newton's law of cooling: dT/dt = k(T - Ts).
Continuous compound interest: dA/dt = rA.
Mixing problems: rate of change = rate in - rate out.
Logistic growth: dP/dt = kP(1 - P/L).

10. Worked Examples Bank
Examples cover conceptual classification, direct integration, separation of variables,
homogeneous equations, integrating factor problems, Bernoulli-style transformations,
orthogonal trajectories, growth and decay, cooling, and mixing.

11. Common Mistakes and Pitfalls
Do not forget the constant of integration.
Do not misread P(x) in the linear form dy/dx + P(x)y = Q(x).
Do not add a constant while computing the integrating factor.
Always substitute back after solving homogeneous equations in v.
Check special solutions that may be lost by division during separation of variables.

12. Summary of All Key Formulas
Direct integration: y = integral of f(x) dx + C.
Separation of variables: integral of g(y) dy = integral of f(x) dx + C.
Homogeneous substitution: y = vx, dy/dx = v + x dv/dx.
Linear integrating factor: y = (1/mu(x)) [integral of mu(x) Q(x) dx + C].

Applications summary:
Exponential growth/decay: y = y0 e^(kt)
Newton cooling: T = Ts + (T0 - Ts)e^(kt)
Continuous compounding: A = A0 e^(rt)
Logistic growth: P = L / (1 + A e^(-kt))
$content$),
    'completed',
    NULL,
    'completed',
    NULL,
    $content$
Differential Equations Senior 5 Content Guide
Curriculum Level: Senior 5 (Advanced Level Mathematics)
Prerequisites: Differentiation, Integration, Algebra, Functions

Learning Outcomes Addressed
LO1: Conceptualize the mechanics and purpose of standard differential equation formulas
LO2: Solve applied problems by correctly selecting and executing given formulas
LO3: Construct novel solutions by deriving techniques from established formulas

Table of Contents
1. What Is a Differential Equation?
2. Key Terminology and Classification
3. General and Particular Solutions
4. Forming Differential Equations
5. Method 1 - Direct Integration
6. Method 2 - Separation of Variables
7. Method 3 - Homogeneous Equations
8. Method 4 - First-Order Linear Equations (Integrating Factor)
9. Applications of Differential Equations
10. Worked Examples Bank
11. Common Mistakes and Pitfalls
12. Summary of All Key Formulas

1. What Is a Differential Equation?
A differential equation is an equation that contains an unknown function and one or more of its derivatives.
It describes a relationship between a quantity and how that quantity changes.
Example: dy/dx = 2y.
Solving the equation means finding the function y(x) that satisfies the rule.

2. Key Terminology and Classification
Order is the highest derivative appearing in the equation.
Degree is the power of the highest-order derivative once written in polynomial form.
Senior 5 focuses mainly on first-order ordinary differential equations.
Linear equations contain y and its derivatives only to the first power and without products between y and derivatives.
Homogeneous first-order equations can be written in the form dy/dx = f(y/x).

3. General and Particular Solutions
A general solution contains arbitrary constants and represents a family of curves.
A particular solution is obtained after applying initial conditions.
Example: if dy/dx = 2x, then y = x^2 + C.
If y(0) = 5, then the particular solution is y = x^2 + 5.

4. Forming Differential Equations
To form a differential equation from a family of curves, differentiate enough times to eliminate the arbitrary constants.
Example: y = A e^(3x) leads to dy/dx = 3y.

5. Method 1 - Direct Integration
Use direct integration when the equation can be written as dy/dx = f(x).
Then y = integral of f(x) dx plus C.
Example: if dy/dx = 4/x, then y = 4 ln|x| + C.

6. Method 2 - Separation of Variables
Use this method when all y terms can be moved to one side and all x terms to the other:
g(y) dy = f(x) dx.
Integrate both sides and then apply any initial conditions.
Example: dy/dx = xy becomes dy/y = x dx, so ln|y| = x^2 / 2 + C.

7. Method 3 - Homogeneous Equations
If dy/dx = f(y/x), use the substitution y = vx, so dy/dx = v + x dv/dx.
This transforms the equation into a separable equation in v and x.
After solving, replace v with y/x.

8. Method 4 - First-Order Linear Equations (Integrating Factor)
Standard form: dy/dx + P(x)y = Q(x).
Integrating factor: mu(x) = e^(integral of P(x) dx).
Then d/dx[mu(x) y] = mu(x) Q(x), which can be integrated directly.

9. Applications of Differential Equations
Exponential growth and decay: dy/dt = ky with solution y = y0 e^(kt).
Newton's law of cooling: dT/dt = k(T - Ts).
Continuous compound interest: dA/dt = rA.
Mixing problems: rate of change = rate in - rate out.
Logistic growth: dP/dt = kP(1 - P/L).

10. Worked Examples Bank
Examples cover conceptual classification, direct integration, separation of variables,
homogeneous equations, integrating factor problems, Bernoulli-style transformations,
orthogonal trajectories, growth and decay, cooling, and mixing.

11. Common Mistakes and Pitfalls
Do not forget the constant of integration.
Do not misread P(x) in the linear form dy/dx + P(x)y = Q(x).
Do not add a constant while computing the integrating factor.
Always substitute back after solving homogeneous equations in v.
Check special solutions that may be lost by division during separation of variables.

12. Summary of All Key Formulas
Direct integration: y = integral of f(x) dx + C.
Separation of variables: integral of g(y) dy = integral of f(x) dx + C.
Homogeneous substitution: y = vx, dy/dx = v + x dv/dx.
Linear integrating factor: y = (1/mu(x)) [integral of mu(x) Q(x) dx + C].

Applications summary:
Exponential growth/decay: y = y0 e^(kt)
Newton cooling: T = Ts + (T0 - Ts)e^(kt)
Continuous compounding: A = A0 e^(rt)
Logistic growth: P = L / (1 + A e^(-kt))
$content$,
    jsonb_build_object(
      'materialId', v_material_id,
      'sourceTitle', 'Differential Equations - Senior 5 Content Guide',
      'mimeType', 'text/plain',
      'extractor', 'manual_sql_seed',
      'sourceHash', md5($content$
Differential Equations Senior 5 Content Guide
Curriculum Level: Senior 5 (Advanced Level Mathematics)
Prerequisites: Differentiation, Integration, Algebra, Functions

Learning Outcomes Addressed
LO1: Conceptualize the mechanics and purpose of standard differential equation formulas
LO2: Solve applied problems by correctly selecting and executing given formulas
LO3: Construct novel solutions by deriving techniques from established formulas
$content$),
      'extractedText', $content$
Differential Equations Senior 5 Content Guide
Curriculum Level: Senior 5 (Advanced Level Mathematics)
Prerequisites: Differentiation, Integration, Algebra, Functions

Learning Outcomes Addressed
LO1: Conceptualize the mechanics and purpose of standard differential equation formulas
LO2: Solve applied problems by correctly selecting and executing given formulas
LO3: Construct novel solutions by deriving techniques from established formulas

Core methods:
- Direct integration
- Separation of variables
- Homogeneous substitution
- First-order linear equations with integrating factor

Applications:
- Exponential growth and decay
- Newton's law of cooling
- Compound interest
- Mixing problems
- Logistic growth
$content$,
      'qualityFlags', jsonb_build_array('manual_seed'),
      'truncated', false,
      'segments', jsonb_build_array(
        jsonb_build_object(
          'segmentId', 'manual_seg_1',
          'order', 0,
          'pageStart', NULL,
          'pageEnd', NULL,
          'headingPath', jsonb_build_array('Differential Equations', 'Senior 5'),
          'text', $content$
Differential equations relate an unknown function to one or more derivatives.
Senior 5 learners study first-order ordinary differential equations, including
direct integration, separation of variables, homogeneous equations, and first-order
linear equations solved with an integrating factor. Applications include growth and
decay, Newton cooling, compound interest, mixing problems, and logistic growth.
$content$,
          'charCount', length($content$
Differential equations relate an unknown function to one or more derivatives.
Senior 5 learners study first-order ordinary differential equations, including
direct integration, separation of variables, homogeneous equations, and first-order
linear equations solved with an integrating factor. Applications include growth and
decay, Newton cooling, compound interest, mixing problems, and logistic growth.
$content$)
        )
      )
    ),
    jsonb_build_object(
      'version', 1,
      'builtAt', now()::text,
      'sourceHash', md5($content$
Differential Equations Senior 5 Content Guide
Curriculum Level: Senior 5 (Advanced Level Mathematics)
Prerequisites: Differentiation, Integration, Algebra, Functions
$content$),
      'materialId', v_material_id,
      'sourceTitle', 'Differential Equations - Senior 5 Content Guide',
      'overview', 'Senior 5 differential equations guide covering concept foundations, classification, general and particular solutions, direct integration, separation of variables, homogeneous equations, first-order linear equations, and standard applications.',
      'sections', jsonb_build_array(
        jsonb_build_object(
          'id', 'manual_section_1',
          'title', 'Core Methods',
          'summary', 'Students should identify and execute direct integration, separation of variables, homogeneous substitution, and integrating factor methods.',
          'keyPoints', jsonb_build_array(
            'Recognize when dy/dx = f(x) allows direct integration.',
            'Separate variables when all y terms can be grouped with dy.',
            'Use y = vx for homogeneous equations of the form dy/dx = f(y/x).',
            'Rewrite first-order linear equations as dy/dx + P(x)y = Q(x) and apply an integrating factor.'
          ),
          'citations', jsonb_build_array()
        ),
        jsonb_build_object(
          'id', 'manual_section_2',
          'title', 'Applications',
          'summary', 'The guide applies differential equations to growth and decay, cooling, finance, mixing, and logistic models.',
          'keyPoints', jsonb_build_array(
            'Exponential growth and decay use dy/dt = ky.',
            'Newton cooling models temperature approach to ambient conditions.',
            'Continuous compounding uses dA/dt = rA.',
            'Mixing problems are structured as rate in minus rate out.',
            'Logistic growth introduces carrying capacity.'
          ),
          'citations', jsonb_build_array()
        )
      ),
      'concepts', jsonb_build_array(
        jsonb_build_object('name', 'Differential equation', 'summary', 'An equation involving an unknown function and one or more derivatives.', 'citations', jsonb_build_array()),
        jsonb_build_object('name', 'General solution', 'summary', 'A family of solutions containing arbitrary constants.', 'citations', jsonb_build_array()),
        jsonb_build_object('name', 'Particular solution', 'summary', 'A specific solution obtained after applying initial conditions.', 'citations', jsonb_build_array()),
        jsonb_build_object('name', 'Homogeneous first-order equation', 'summary', 'A first-order equation that can be written as dy/dx = f(y/x).', 'citations', jsonb_build_array()),
        jsonb_build_object('name', 'Integrating factor', 'summary', 'The multiplier mu(x) = e^(integral P(x) dx) used to solve dy/dx + P(x)y = Q(x).', 'citations', jsonb_build_array())
      ),
      'definitions', jsonb_build_array(),
      'procedures', jsonb_build_array(
        jsonb_build_object(
          'name', 'Direct integration',
          'summary', 'Integrate both sides when the derivative depends only on x.',
          'steps', jsonb_build_array('Rewrite as dy/dx = f(x).', 'Integrate both sides.', 'Add the constant of integration.', 'Apply initial conditions if given.'),
          'citations', jsonb_build_array()
        ),
        jsonb_build_object(
          'name', 'Separation of variables',
          'summary', 'Group y terms with dy and x terms with dx, then integrate.',
          'steps', jsonb_build_array('Rewrite as g(y) dy = f(x) dx.', 'Integrate both sides.', 'Simplify and solve for y where possible.', 'Apply any initial conditions.'),
          'citations', jsonb_build_array()
        ),
        jsonb_build_object(
          'name', 'Homogeneous substitution',
          'summary', 'Use y = vx so that dy/dx = v + x dv/dx, then solve the resulting separable equation.',
          'steps', jsonb_build_array('Verify dy/dx = f(y/x).', 'Substitute y = vx.', 'Separate variables in v and x.', 'Integrate and replace v with y/x.'),
          'citations', jsonb_build_array()
        ),
        jsonb_build_object(
          'name', 'Integrating factor method',
          'summary', 'Solve dy/dx + P(x)y = Q(x) using mu(x) = e^(integral P(x) dx).',
          'steps', jsonb_build_array('Write the equation in standard form.', 'Compute the integrating factor.', 'Multiply through by the integrating factor.', 'Integrate d/dx[mu(x)y] = mu(x)Q(x).', 'Solve for y.'),
          'citations', jsonb_build_array()
        )
      ),
      'formulas', jsonb_build_array(
        jsonb_build_object('label', 'Direct integration', 'expression', 'y = integral f(x) dx + C', 'conditions', 'Use when dy/dx = f(x).', 'usageNotes', '', 'citations', jsonb_build_array()),
        jsonb_build_object('label', 'Integrating factor', 'expression', 'mu(x) = e^(integral P(x) dx)', 'conditions', 'Use for dy/dx + P(x)y = Q(x).', 'usageNotes', '', 'citations', jsonb_build_array()),
        jsonb_build_object('label', 'Exponential growth/decay', 'expression', 'y = y0 e^(kt)', 'conditions', 'Model dy/dt = ky.', 'usageNotes', '', 'citations', jsonb_build_array()),
        jsonb_build_object('label', 'Newton cooling', 'expression', 'T = Ts + (T0 - Ts)e^(kt)', 'conditions', 'Model dT/dt = k(T - Ts).', 'usageNotes', '', 'citations', jsonb_build_array()),
        jsonb_build_object('label', 'Logistic growth', 'expression', 'P = L / (1 + A e^(-kt))', 'conditions', 'Model dP/dt = kP(1 - P/L).', 'usageNotes', '', 'citations', jsonb_build_array())
      ),
      'notationRules', jsonb_build_array(
        'Use Leibniz notation when variable separation is helpful.',
        'Prime notation and Leibniz notation are both acceptable if used consistently.'
      ),
      'rigorRules', jsonb_build_array(
        'Always include the constant of integration in general solutions.',
        'State and apply initial conditions clearly when forming a particular solution.',
        'Check whether special solutions were lost during division in separation of variables.'
      ),
      'scopeRules', jsonb_build_array(
        'Focus on first-order ordinary differential equations at Senior 5 level.',
        'Use standard applications drawn from growth, decay, cooling, finance, mixing, and logistic growth.'
      ),
      'explicitlyOutOfScope', jsonb_build_array(
        'Advanced second-order and higher-order methods beyond Senior 5 scope.',
        'Partial differential equations beyond introductory distinction from ODEs.'
      ),
      'teachingNotes', jsonb_build_array(
        'Tie each solving method to a recognition pattern before asking students to compute.',
        'Use worked examples to distinguish general solutions from particular solutions.',
        'Emphasize method selection, not just symbolic manipulation.'
      ),
      'ambiguities', jsonb_build_array(),
      'segmentGroundings', jsonb_build_array()
    ),
    jsonb_build_object(
      'summary', 'Manual coverage review seeded from the Senior 5 differential equations content guide.',
      'groundingSummary', 'The material covers classification, standard first-order methods, and common applications expected at Senior 5.',
      'supportedOutcomes', jsonb_build_array(
        'Conceptualize the mechanics and purpose of standard differential equation formulas',
        'Solve applied problems by correctly selecting and executing given formulas',
        'Construct novel solutions by deriving techniques from established formulas'
      ),
      'partialOutcomes', jsonb_build_array(),
      'unsupportedOutcomes', jsonb_build_array(),
      'clarifyingQuestions', jsonb_build_array(),
      'coverageObservations', jsonb_build_array(
        'The material strongly supports first-order differential equation method selection.',
        'Applications are included for growth and decay, cooling, finance, mixing, and logistic models.'
      ),
      'recommendedOutcomeEdits', jsonb_build_array(),
      'rigorNotes', jsonb_build_array(
        'Require constants of integration in all general solutions.',
        'Require explicit substitution back after homogeneous-variable changes.'
      ),
      'notationNotes', jsonb_build_array(
        'Leibniz notation is preferred for separation of variables.',
        'Prime notation may be used for compact derivative writing.'
      ),
      'scopeNotes', jsonb_build_array(
        'Senior 5 scope is mainly first-order ordinary differential equations.'
      )
    ),
    jsonb_build_object(
      'summary', 'Manual coverage review seeded from the Senior 5 differential equations content guide.',
      'groundingSummary', 'The material covers classification, standard first-order methods, and common applications expected at Senior 5.',
      'supportedOutcomes', jsonb_build_array(
        'Conceptualize the mechanics and purpose of standard differential equation formulas',
        'Solve applied problems by correctly selecting and executing given formulas',
        'Construct novel solutions by deriving techniques from established formulas'
      ),
      'partialOutcomes', jsonb_build_array(),
      'unsupportedOutcomes', jsonb_build_array(),
      'clarifyingQuestions', jsonb_build_array(),
      'coverageObservations', jsonb_build_array(
        'The material strongly supports first-order differential equation method selection.',
        'Applications are included for growth and decay, cooling, finance, mixing, and logistic models.'
      ),
      'recommendedOutcomeEdits', jsonb_build_array(),
      'rigorNotes', jsonb_build_array(
        'Require constants of integration in all general solutions.',
        'Require explicit substitution back after homogeneous-variable changes.'
      ),
      'notationNotes', jsonb_build_array(
        'Leibniz notation is preferred for separation of variables.',
        'Prime notation may be used for compact derivative writing.'
      ),
      'scopeNotes', jsonb_build_array(
        'Senior 5 scope is mainly first-order ordinary differential equations.'
      )
    ),
    now(),
    now()
  );

  UPDATE learning_topics
  SET
    learning_outcomes = jsonb_build_array(
      jsonb_build_object(
        'id', 'lo1',
        'title', 'Conceptualize standard differential equation formulas',
        'description', 'Explain the mechanics and purpose of standard differential equation formulas used at Senior 5 level.',
        'evidenceSignals', jsonb_build_array(),
        'misconceptionTags', jsonb_build_array(),
        'masteryThreshold', 0
      ),
      jsonb_build_object(
        'id', 'lo2',
        'title', 'Solve applied differential equation problems',
        'description', 'Select and execute the correct first-order differential equation formula or method for a standard application problem.',
        'evidenceSignals', jsonb_build_array(),
        'misconceptionTags', jsonb_build_array(),
        'masteryThreshold', 0
      ),
      jsonb_build_object(
        'id', 'lo3',
        'title', 'Construct novel solutions from established methods',
        'description', 'Derive or adapt a solution technique from established differential equation formulas in unfamiliar but related problems.',
        'evidenceSignals', jsonb_build_array(),
        'misconceptionTags', jsonb_build_array(),
        'masteryThreshold', 0
      )
    ),
    source_boundary = jsonb_build_object(
      'teacherSummary', 'Senior 5 differential equations: definition, classification, general versus particular solutions, forming equations, direct integration, separation of variables, homogeneous substitution, first-order linear equations with integrating factor, and standard applications.',
      'allowedMaterialIds', jsonb_build_array(v_material_id),
      'rigorNotes', jsonb_build_array(
        'Always include constants of integration.',
        'Use initial conditions carefully to move from a general solution to a particular solution.',
        'Check for special solutions that may be lost during separation of variables.'
      ),
      'notationNotes', jsonb_build_array(
        'Use Leibniz notation when separating variables.',
        'Prime notation is acceptable when the derivative meaning remains clear.'
      ),
      'scopeNotes', jsonb_build_array(
        'Focus on first-order ordinary differential equations at Senior 5 level.',
        'Use examples drawn from growth and decay, cooling, finance, mixing, and logistic growth.'
      ),
      'hallucinationPolicy', 'Stay inside the uploaded course material for concepts, notation, rigor, and problem scope. Use model intelligence only for pedagogy and framing.'
    ),
    topic_grounding_pack = jsonb_build_object(
      'version', v_pack_version,
      'builtAt', now()::text,
      'materialIds', jsonb_build_array(v_material_id),
      'topicTitle', v_topic.title,
      'digest', 'Senior 5 differential equations: concept foundations, first-order method selection, worked procedures, common pitfalls, and classic applications.',
      'inScopeConcepts', jsonb_build_array(
        jsonb_build_object('name', 'Differential equation', 'summary', 'An equation involving an unknown function and one or more derivatives.', 'citations', jsonb_build_array()),
        jsonb_build_object('name', 'General solution', 'summary', 'A family of solutions containing arbitrary constants.', 'citations', jsonb_build_array()),
        jsonb_build_object('name', 'Particular solution', 'summary', 'A specific solution obtained after applying initial conditions.', 'citations', jsonb_build_array()),
        jsonb_build_object('name', 'Integrating factor', 'summary', 'The multiplier used to solve first-order linear equations.', 'citations', jsonb_build_array())
      ),
      'explicitlyOutOfScope', jsonb_build_array(
        'Advanced higher-order techniques beyond the Senior 5 guide.',
        'Partial differential equation solution methods.'
      ),
      'formulas', jsonb_build_array(
        jsonb_build_object('id', 'pack_formula_1', 'label', 'Direct integration', 'expression', 'y = integral f(x) dx + C', 'conditions', 'Use when dy/dx = f(x).', 'usageNotes', '', 'citations', jsonb_build_array()),
        jsonb_build_object('id', 'pack_formula_2', 'label', 'Integrating factor', 'expression', 'mu(x) = e^(integral P(x) dx)', 'conditions', 'Use for dy/dx + P(x)y = Q(x).', 'usageNotes', '', 'citations', jsonb_build_array()),
        jsonb_build_object('id', 'pack_formula_3', 'label', 'Exponential growth/decay', 'expression', 'y = y0 e^(kt)', 'conditions', 'Model dy/dt = ky.', 'usageNotes', '', 'citations', jsonb_build_array())
      ),
      'sections', jsonb_build_array(
        jsonb_build_object(
          'id', 'pack_section_1',
          'title', 'Method Selection',
          'summary', 'Choose among direct integration, separation of variables, homogeneous substitution, and integrating factor methods by structure.',
          'keyPoints', jsonb_build_array(
            'Direct integration when the derivative depends only on x.',
            'Separation of variables when y terms and x terms can be isolated.',
            'Homogeneous substitution for equations in y/x.',
            'Integrating factor for dy/dx + P(x)y = Q(x).'
          ),
          'citations', jsonb_build_array()
        ),
        jsonb_build_object(
          'id', 'pack_section_2',
          'title', 'Applications',
          'summary', 'Apply first-order differential equations to growth, decay, cooling, finance, mixing, and logistic growth.',
          'keyPoints', jsonb_build_array(
            'Exponential growth and decay use dy/dt = ky.',
            'Newton cooling uses dT/dt = k(T - Ts).',
            'Mixing problems follow rate in minus rate out.'
          ),
          'citations', jsonb_build_array()
        )
      ),
      'notationRules', jsonb_build_array(
        'Use Leibniz notation when separating variables.',
        'Prime notation is acceptable for concise derivative notation.'
      ),
      'rigorRules', jsonb_build_array(
        'Always include constants of integration.',
        'State initial conditions explicitly before solving for constants.',
        'Substitute back after the homogeneous change of variables.'
      ),
      'scopeRules', jsonb_build_array(
        'Senior 5 scope is mainly first-order ordinary differential equations.',
        'Keep examples aligned with the supplied guide.'
      ),
      'teachingNotes', jsonb_build_array(
        'Emphasize recognition of equation form before symbolic manipulation.',
        'Use worked examples to contrast general and particular solutions.',
        'Reinforce common pitfalls such as missing constants and incorrect integrating factors.'
      ),
      'conflictNotes', jsonb_build_array(),
      'sourceSummaries', jsonb_build_array(
        jsonb_build_object(
          'materialId', v_material_id,
          'title', 'Differential Equations - Senior 5 Content Guide',
          'overview', 'Senior 5 guide covering first-order differential equations, applications, and common pitfalls.'
        )
      )
    ),
    topic_grounding_pack_built_at = now(),
    last_material_sync_at = now(),
    status = 'active',
    updated_at = now()
  WHERE id = v_topic.id;

  SELECT
    f.id,
    f.active_version_id
  INTO
    v_framework_id,
    v_active_framework_version_id
  FROM expert_frameworks f
  WHERE
    f.topic_id = v_topic.id
    OR f.classroom_id = v_topic.classroom_id
    OR f.course_id = v_topic.course_id
  ORDER BY
    CASE
      WHEN f.topic_id = v_topic.id THEN 1
      WHEN f.classroom_id = v_topic.classroom_id THEN 2
      WHEN f.course_id = v_topic.course_id THEN 3
      ELSE 4
    END,
    f.created_at DESC
  LIMIT 1;

  IF v_framework_id IS NULL THEN
    v_framework_id := 'framework_' || substr(md5(clock_timestamp()::text || random()::text), 1, 18);
    v_active_framework_version_id := 'framework_version_' || substr(md5(clock_timestamp()::text || random()::text), 1, 18);

    INSERT INTO expert_frameworks (
      id,
      course_id,
      subject_key,
      classroom_id,
      topic_id,
      name,
      description,
      active_version_id,
      archived_at,
      created_at,
      updated_at
    ) VALUES (
      v_framework_id,
      v_topic.course_id,
      COALESCE(v_topic.subject_key, 'general'),
      NULL,
      NULL,
      'Manual Differential Equations Framework',
      'Emergency framework seeded automatically to unblock tutoring session activation.',
      v_active_framework_version_id,
      NULL,
      now(),
      now()
    );

    INSERT INTO expert_framework_versions (
      id,
      framework_id,
      version,
      status,
      seed_source,
      framework,
      notes,
      published_at,
      published_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      v_active_framework_version_id,
      v_framework_id,
      1,
      'published',
      'expert_authored',
      jsonb_build_object(
        'name', 'Manual Differential Equations Framework',
        'description', 'Emergency framework seeded automatically to unblock tutoring.',
        'toolUsageGuidance', '',
        'fewShotExamples', jsonb_build_array(),
        'markdownContent', '',
        'metadata', jsonb_build_object()
      ),
      'Emergency auto-seeded framework.',
      now(),
      v_topic.created_by_user_id,
      now(),
      now()
    );
  ELSIF v_active_framework_version_id IS NULL THEN
    SELECT
      id,
      version
    INTO
      v_latest_framework_version_id,
      v_latest_framework_version_number
    FROM expert_framework_versions
    WHERE framework_id = v_framework_id
    ORDER BY version DESC, created_at DESC
    LIMIT 1;

    IF v_latest_framework_version_id IS NULL THEN
      v_active_framework_version_id := 'framework_version_' || substr(md5(clock_timestamp()::text || random()::text), 1, 18);
      INSERT INTO expert_framework_versions (
        id,
        framework_id,
        version,
        status,
        seed_source,
        framework,
        notes,
        published_at,
        published_by_user_id,
        created_at,
        updated_at
      ) VALUES (
        v_active_framework_version_id,
        v_framework_id,
        1,
        'published',
        'expert_authored',
        jsonb_build_object(
          'name', 'Manual Differential Equations Framework',
          'description', 'Emergency framework seeded automatically to unblock tutoring.',
          'toolUsageGuidance', '',
          'fewShotExamples', jsonb_build_array(),
          'markdownContent', '',
          'metadata', jsonb_build_object()
        ),
        'Emergency auto-seeded framework.',
        now(),
        v_topic.created_by_user_id,
        now(),
        now()
      );
    ELSE
      v_active_framework_version_id := v_latest_framework_version_id;

      UPDATE expert_framework_versions
      SET
        status = 'published',
        published_at = COALESCE(published_at, now()),
        published_by_user_id = COALESCE(published_by_user_id, v_topic.created_by_user_id),
        updated_at = now()
      WHERE id = v_active_framework_version_id;
    END IF;

    UPDATE expert_frameworks
    SET
      active_version_id = v_active_framework_version_id,
      updated_at = now()
    WHERE id = v_framework_id;
  END IF;

  INSERT INTO student_interest_profiles (
    id,
    classroom_student_id,
    profile,
    visibility,
    last_refreshed_at,
    created_at,
    updated_at
  )
  SELECT
    'interest_profile_' || substr(md5(cs.id || clock_timestamp()::text || random()::text), 1, 18),
    cs.id,
    jsonb_build_object(
      'primaryInterests', jsonb_build_array(),
      'aspirations', jsonb_build_array(),
      'curiosityAreas', jsonb_build_array(),
      'motivationalStyle', jsonb_build_array(),
      'learningRelationship', 'neutral',
      'contextTags', jsonb_build_array('Emergency seeded profile for tutoring access'),
      'privateNotes', jsonb_build_array(),
      'lastUpdated', now()::text
    ),
    'private_to_student_and_agent',
    now(),
    now(),
    now()
  FROM classroom_students cs
  WHERE
    cs.classroom_id = v_topic.classroom_id
    AND NOT EXISTS (
      SELECT 1
      FROM student_interest_profiles sip
      WHERE sip.classroom_student_id = cs.id
    );

  GET DIAGNOSTICS v_seeded_profiles = ROW_COUNT;

  RAISE NOTICE 'Manual tutoring seed complete for topic %', v_topic.id;
  RAISE NOTICE 'Inserted material id: %', v_material_id;
  RAISE NOTICE 'Framework id: %', v_framework_id;
  RAISE NOTICE 'Active framework version id: %', v_active_framework_version_id;
  RAISE NOTICE 'Student profiles seeded: %', v_seeded_profiles;
END
$seed$;

SELECT
  t.id AS topic_id,
  t.title AS topic_title,
  t.status AS topic_status,
  t.topic_grounding_pack_built_at,
  COALESCE(jsonb_array_length(t.learning_outcomes), 0) AS learning_outcome_count,
  COALESCE(jsonb_array_length(t.topic_grounding_pack->'materialIds'), 0) AS pack_material_count,
  (
    SELECT count(*)
    FROM topic_materials tm
    WHERE tm.topic_id = t.id
      AND tm.extraction_status = 'completed'
      AND tm.indexing_status = 'completed'
  ) AS completed_material_count,
  (
    SELECT ef.active_version_id
    FROM expert_frameworks ef
    WHERE ef.topic_id = t.id OR ef.classroom_id = t.classroom_id OR ef.course_id = t.course_id
    ORDER BY
      CASE
        WHEN ef.topic_id = t.id THEN 1
        WHEN ef.classroom_id = t.classroom_id THEN 2
        WHEN ef.course_id = t.course_id THEN 3
        ELSE 4
      END,
      ef.created_at DESC
    LIMIT 1
  ) AS active_framework_version_id,
  (
    SELECT count(*)
    FROM classroom_students cs
    WHERE cs.classroom_id = t.classroom_id
  ) AS classroom_student_count,
  (
    SELECT count(*)
    FROM classroom_students cs
    JOIN student_interest_profiles sip ON sip.classroom_student_id = cs.id
    WHERE cs.classroom_id = t.classroom_id
  ) AS classroom_student_profile_count
FROM learning_topics t
WHERE t.id = :'topic_id';
SQL
