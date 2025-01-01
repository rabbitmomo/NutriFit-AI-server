const express = require('express');
const dotenv = require('dotenv');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000; 

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(cors());
app.use(express.json());

// Route for OpenAI Analysis general (testing purposes)
app.post('/openai', async (req, res) => {
  const prompt = req.body.prompt;

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const content = response.data.choices[0]?.message?.content;

    res.json({ message: content });
  } catch (error) {
    console.error('Error response:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'OpenAI API request failed', 
      details: error.response?.data || error.message 
    });
  }
});

//route for openai analysis then save into supabase
app.post('/openai-supabase', async (req, res) => {
  const prompt = req.body.prompt;

  try {
    const includeResponse = await requestGPT(`Please list the ingredients to include (ingredients he will like) in the meal, separated by commas, based on the following input: "${prompt}" (e.g., "carrots, vegetables"). Do not provide any extra explanation, just the ingredients.`);
    const ingredientsToInclude = parseResponse(includeResponse, 'ingredients to include');

    const excludeResponse = await requestGPT(`Please list the ingredients to exclude (ingredients he will not like) in the meal, separated by commas, based on the following input: "${prompt}" (e.g., "pork"). Do not provide any extra explanation, just the ingredients.`);
    const ingredientsToExclude = parseResponse(excludeResponse, 'ingredients to exclude');

    const mealResponse = await requestGPT(`Based on the following input: "${prompt}", please provide the meal preference as a single text, such as "pasta", without any extra explanation or details.`);
    const mealPreferences = parseResponse(mealResponse, 'meal preferences');

    const dietResponse = await requestGPT(`Based on the following input: "${prompt}", please determine if the dietary preference is either "high-protein" or "vegetarian". Respond with only one of these options, and do not provide any extra explanation.`);
    const dietaryPreferences = parseResponse(dietResponse, 'dietary preferences');

    const bodyPartResponse = await requestGPT(`Based on the following input: "${prompt}", please suggest the body part to train. Choose one of the following options, in all word in lowercase: back, cardio, chest, lower arms, lower legs, neck, shoulders, upper arms, upper legs, or waist. Respond with only one option, with no extra explanation.`);
    const bodyPartTrained = parseResponse(bodyPartResponse, 'body part trained');

    const data = {
      ingredients_to_include: ingredientsToInclude.length > 0 ? ingredientsToInclude : ['No'],  
      ingredients_to_exclude: ingredientsToExclude.length > 0 ? ingredientsToExclude : ['No'],  
      dietary_preferences: dietaryPreferences || 'No',  
      bodypart_trained: bodyPartTrained || 'No',  
      meal_preferences: mealPreferences || 'No'  
    };

    const { data: insertData, error } = await supabase
      .from('user_preferences')  
      .insert([data]);

    if (error) {
      throw new Error(error.message);
    }

    return res.json({ message: 'Data added successfully', data: insertData });

  } catch (error) {
    console.error('Error in /openai-supabase:', error.message);
    return res.status(500).json({
      error: 'OpenAI API request failed',
      details: error.message
    });
  }
});

// function to request GPT-3.5 API
async function requestGPT(prompt) {
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('Error in GPT request:', error.message);
    throw new Error('Failed to process GPT request');
  }
}

// function to format response
function parseResponse(response, type) {
  if (!response) return 'No';  

  switch (type) {
    case 'ingredients to include':
    case 'ingredients to exclude':
      return response.split(',').map(ingredient => ingredient.trim()).filter(ingredient => ingredient.length > 0);
    case 'meal preferences':
    case 'dietary preferences':
    case 'body part trained':
      return response.trim().split('\n')[0] || 'No';  
    default:
      return 'No';
  }
}

//route for testing the recipe api from spoonacular
app.get('/recipes', async (req, res) => {
    const query = req.query.query;
    const excludeIngredients = req.query.excludeIngredients || ''; 
    const diet = req.query.diet || ''; 

    try {
        const response = await axios.get('https://api.spoonacular.com/recipes/complexSearch', {
            params: {
                query: query, 
                apiKey: process.env.SPOONACULAR_API_KEY, 
                number: 10, 
                excludeIngredients: excludeIngredients, 
                diet: diet, 
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Spoonacular API request failed' });
    }
});

//route for recipes by ingredients testing
app.get('/recipes-by-ingredients', async (req, res) => {
    const ingredients = req.query.ingredients; 
  
    try {
      const response = await axios.get('https://api.spoonacular.com/recipes/findByIngredients', {
        params: {
          ingredients: ingredients, 
          apiKey: process.env.SPOONACULAR_API_KEY, 
          number: 10, 
          excludeIngredients: req.query.excludeIngredients, 
          diet: req.query.diet 
        }
      });

      const simplifiedRecipes = response.data.map(recipe => ({
        id: recipe.id,
        title: recipe.title,
        image: recipe.image,
        likes: recipe.likes, 
      }));

      res.json(simplifiedRecipes);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Spoonacular API request failed' });
    }
});

//route for combined recipes search testing
app.get('/combined-recipes-search', async (req, res) => {
    const query = req.query.query; 
    const ingredients = req.query.ingredients; 
    const excludeIngredients = req.query.excludeIngredients || '';
    const diet = req.query.diet || ''; 

    try {
        const ingredientsResponse = await axios.get('https://api.spoonacular.com/recipes/findByIngredients', {
            params: {
                ingredients: ingredients, 
                apiKey: process.env.SPOONACULAR_API_KEY, 
                number: 3, 
                excludeIngredients: excludeIngredients, 
                diet: diet, 
            }
        });

        const queryResponse = await axios.get('https://api.spoonacular.com/recipes/complexSearch', {
            params: {
                query: query, 
                apiKey: process.env.SPOONACULAR_API_KEY, 
                number: 3, 
                excludeIngredients: excludeIngredients, 
                diet: diet, 
            }
        });

        const combinedResults = [...ingredientsResponse.data, ...queryResponse.data.results];

        const simplifiedResults = combinedResults.map(recipe => ({
            id: recipe.id,
            title: recipe.title,
            image: recipe.image,
            likes: recipe.likes, 
        }));

        // Remove duplicates (based on recipe ID) if any
        const uniqueResults = Array.from(new Set(simplifiedResults.map(a => a.id)))
            .map(id => {
                return simplifiedResults.find(a => a.id === id);
            });

        res.json(uniqueResults);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Spoonacular API request failed' });
    }
});
  

//route for recipe details by id
app.get('/recipe-data/:id', async (req, res) => {
    const recipeId = req.params.id;
  
    try {
      const response = await axios.get(`https://api.spoonacular.com/recipes/${recipeId}/information`, {
        params: {
          apiKey: process.env.SPOONACULAR_API_KEY, // API Key
        }
      });
  
      res.json(response.data);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Spoonacular API request failed' });
    }
});

// Route to fetch exercise data by ID
app.get('/exercise-data/:id', async (req, res) => {
  try {
    const { id } = req.params; 
    const { data, error } = await supabase
      .from('exercise_data')
      .select('*')
      .eq('id', id) 
      .single(); 

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return res.status(404).json({ error: `No exercise data found with ID: ${id}` });
    }

    return res.json({
      message: 'Exercise data fetched successfully',
      data: data,
    });
  } catch (e) {
    console.error("Error in /exercise-data/:id:", e);
    return res.status(500).json({ error: 'Failed to fetch exercise data', message: e.message });
  }
});
  

/// Route for Nutritionix API (Food nutrition data)
app.get('/nutrition', async (req, res) => {
  const query = req.query.query;

  try {
      const response = await axios.post('https://trackapi.nutritionix.com/v2/natural/nutrients', {
          query: query
      }, {
          headers: {
              'Content-Type': 'application/json',
              'x-app-id': process.env.NUTRITIONIX_APP_ID,
              'x-app-key': process.env.NUTRITIONIX_API_KEY
          }
      });

      const nutritionData = response.data.foods[0];

      // Extract important information
      const nutritionInfo = {
          food_name: nutritionData.food_name,
          serving_qty: nutritionData.serving_qty,
          serving_unit: nutritionData.serving_unit,
          calories: nutritionData.nf_calories,
          total_fat: nutritionData.nf_total_fat,
          saturated_fat: nutritionData.nf_saturated_fat,
          cholesterol: nutritionData.nf_cholesterol,
          sodium: nutritionData.nf_sodium,
          total_carbohydrate: nutritionData.nf_total_carbohydrate,
          dietary_fiber: nutritionData.nf_dietary_fiber,
          sugars: nutritionData.nf_sugars,
          protein: nutritionData.nf_protein,
          potassium: nutritionData.nf_potassium,
          image_url: nutritionData.photo ? nutritionData.photo.highres : null
      };

      // Save into Supabase
      const { data, error } = await supabase
          .from('nutrition_data') 
          .insert([
              {
                  food_name: nutritionInfo.food_name,
                  serving_qty: nutritionInfo.serving_qty,
                  serving_unit: nutritionInfo.serving_unit,
                  calories: nutritionInfo.calories,
                  total_fat: nutritionInfo.total_fat,
                  saturated_fat: nutritionInfo.saturated_fat,
                  cholesterol: nutritionInfo.cholesterol,
                  sodium: nutritionInfo.sodium,
                  total_carbohydrate: nutritionInfo.total_carbohydrate,
                  dietary_fiber: nutritionInfo.dietary_fiber,
                  sugars: nutritionInfo.sugars,
                  protein: nutritionInfo.protein,
                  potassium: nutritionInfo.potassium,
                  image_url: nutritionInfo.image_url 
              }
          ]);

      if (error) {
          console.error(error);
          return res.status(500).json({ error: 'Failed to save nutrition data in Supabase' });
      }

      res.json({ message: 'Nutrition data saved successfully!', data });
  } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Nutritionix API request failed' });
  }
});

// Fetch 20 nutrition records
app.get('/latest-nutrition', async (req, res) => {
  try {
      const { data, error } = await supabase
          .from('nutrition_data')
          .select('*')
          .order('id', { ascending: false })  
          .limit(20);  

      if (error) {
          console.error('Error fetching data:', error);
          return res.status(500).json({ error: 'Error fetching data from Supabase' });
      }

      res.json(data);
  } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});


// Route for fetching exercise data
app.get('/exercises', async (req, res) => {
    try {
      const response = await axios.get('https://exercisedb.p.rapidapi.com/exercises', {
        headers: {
          'x-rapidapi-key': process.env.RAPIDAPI_KEY, 
          'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
        },
        params: {
          limit: 10, 
          offset: 0, 
        },
      });
  
      res.json(response.data);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'ExerciseDB API request failed' });
    }
});

app.post('/add-data', async (req, res) => {
  const { ingredientsToInclude, ingredientsToExclude, dietaryPreferences, bodyPartTrained, mealPreferences } = req.body;

  if (!ingredientsToInclude || !ingredientsToExclude || !dietaryPreferences || !bodyPartTrained || !mealPreferences) {
      return res.status(400).json({ error: 'All fields are required' });
  }

  if (typeof bodyPartTrained !== 'string' || bodyPartTrained.trim() === '') {
    return res.status(400).json({ error: 'bodyPartTrained must be a non-empty string' });
  }

  const formattedMealPreferences = typeof mealPreferences === 'string' ? mealPreferences : mealPreferences[0];

  try {
    // Save data to Supabase
    const { data, error } = await supabase
      .from('user_preferences')  // Table name
      .insert([
        {
          ingredients_to_include: ingredientsToInclude,
          ingredients_to_exclude: ingredientsToExclude,
          dietary_preferences: dietaryPreferences,
          bodypart_trained: bodyPartTrained,
          meal_preferences: formattedMealPreferences 
        }
      ]);

    if (error) {
      throw new Error(error.message);
    }

    return res.json({ message: 'Data added successfully', data });
  } catch (e) {
    console.error("Error in /add-data:", e);
    return res.status(500).json({ error: 'Failed to add data', message: e.message });
  }
});

app.get('/latest-data', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .order('created_at', { ascending: false }) 
      .limit(1);  // most recent entry

    if (error) {
      throw new Error(error.message);
    }

    if (data.length === 0) {
      return res.status(404).json({ error: 'No data found' });
    }

    return res.json({ data: data[0] });
  } catch (e) {
    console.error("Error in /latest-data:", e);
    return res.status(500).json({ error: 'Failed to fetch data', message: e.message });
  }
});

app.get('/latest-data-with-recipes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);  // most recent entry

    if (error) {
      throw new Error(error.message);
    }

    if (data.length === 0) {
      return res.status(404).json({ error: 'No user preferences found' });
    }

    const latestData = data[0];
    const ingredientsToInclude = latestData.ingredients_to_include.join(',');
    const ingredientsToExclude = latestData.ingredients_to_exclude.join(',');
    const dietaryPreferences = latestData.dietary_preferences;

    const response = await axios.get('https://api.spoonacular.com/recipes/findByIngredients', {
      params: {
        ingredients: ingredientsToInclude, 
        excludeIngredients: ingredientsToExclude, 
        diet: dietaryPreferences, 
        apiKey: process.env.SPOONACULAR_API_KEY, 
        number: 200, // Fetch more recipes to ensure enough for sorting
      },
    });

    const sortedRecipes = response.data
      .sort((a, b) => b.likes - a.likes) 
      .slice(0, 21); // Get top 21 recipes

    const simplifiedRecipes = sortedRecipes.map(recipe => ({
      id: recipe.id,
      title: recipe.title,
      image: recipe.image,
      likes: recipe.likes,
    }));

    const mealDataInserts = simplifiedRecipes.map(recipe => ({
      id: recipe.id,
      title: recipe.title,
      image: recipe.image,
      likes: recipe.likes,
    }));

    const { error: mealDataError } = await supabase
      .from('meal_data')
      .upsert(mealDataInserts, { onConflict: ['id'] });  
    if (mealDataError) {
      throw new Error(mealDataError.message);
    }

    const userMealInsert = {
      meal_id_1: simplifiedRecipes[0].id,
      meal_id_2: simplifiedRecipes[1].id,
      meal_id_3: simplifiedRecipes[2].id,
      meal_id_4: simplifiedRecipes[3].id,
      meal_id_5: simplifiedRecipes[4].id,
      meal_id_6: simplifiedRecipes[5].id,
      meal_id_7: simplifiedRecipes[6].id,
      meal_id_8: simplifiedRecipes[7].id,
      meal_id_9: simplifiedRecipes[8].id,
      meal_id_10: simplifiedRecipes[9].id,
      meal_id_11: simplifiedRecipes[10].id,
      meal_id_12: simplifiedRecipes[11].id,
      meal_id_13: simplifiedRecipes[12].id,
      meal_id_14: simplifiedRecipes[13].id,
      meal_id_15: simplifiedRecipes[14].id,
      meal_id_16: simplifiedRecipes[15].id,
      meal_id_17: simplifiedRecipes[16].id,
      meal_id_18: simplifiedRecipes[17].id,
      meal_id_19: simplifiedRecipes[18].id,
      meal_id_20: simplifiedRecipes[19].id,
      meal_id_21: simplifiedRecipes[20].id,
    };

    const { error: userMealError } = await supabase
      .from('user_meal')
      .insert([userMealInsert]);

    if (userMealError) {
      throw new Error(userMealError.message);
    }

    res.json({
      recipes: simplifiedRecipes,
    });
  } catch (error) {
    console.error("Error in /latest-data-with-recipes:", error);
    res.status(500).json({ error: 'Failed to fetch latest data and recipes', message: error.message });
  }
});

//fetch latest meal data
app.get('/latest-meal-data', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('meal_data')
      .select('*')
      .order('created_at', { ascending: false }) 
      .limit(21); //latest 21 records

    if (error) {
      throw new Error(error.message);
    }

    if (data.length === 0) {
      return res.status(404).json({ error: 'No meal data found' });
    }

    return res.json({
      message: 'Latest meal data fetched successfully',
      data: data,
    });
  } catch (e) {
    console.error("Error in /latest-meal-data:", e);
    return res.status(500).json({ error: 'Failed to fetch meal data', message: e.message });
  }
});

//route get latest data with exercises by performing search in exercisedb
app.get('/latest-data-with-exercises', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .order('created_at', { ascending: false }) 
      .limit(1);  // most recent entry

    if (error) {
      throw new Error(error.message);
    }

    if (data.length === 0) {
      return res.status(404).json({ error: 'No user data found' });
    }

    const bodyPartTrained = data[0].bodypart_trained;

    const response = await axios.get(`https://exercisedb.p.rapidapi.com/exercises/bodyPart/${bodyPartTrained}`, {
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY, 
        'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
      },
      params: {
        limit: 7,
      },
    });

    const exercises = response.data.map(exercise => ({
      id: exercise.id,
      bodyPart: exercise.bodyPart,
      equipment: exercise.equipment,
      gifUrl: exercise.gifUrl,
      name: exercise.name,
      target: exercise.target,
      secondaryMuscles: exercise.secondaryMuscles,
      instructions: exercise.instructions,
    }));

    const exerciseDataInserts = exercises.map(exercise => ({
      id: exercise.id,
      body_part: exercise.bodyPart,
      equipment: exercise.equipment,
      gif_url: exercise.gifUrl,
      name: exercise.name,
      target: exercise.target,
      secondary_muscles: exercise.secondaryMuscles,
      instructions: exercise.instructions,
    }));

    const { error: exerciseDataError } = await supabase
      .from('exercise_data')
      .upsert(exerciseDataInserts, { onConflict: ['id'] });  // Prevent duplicates
    
    if (exerciseDataError) {
      throw new Error(exerciseDataError.message);
    }

    const userExerciseInsert = {
      exercise_id_1: exercises[0].id,
      exercise_id_2: exercises[1].id,
      exercise_id_3: exercises[2].id,
      exercise_id_4: exercises[3].id,
      exercise_id_5: exercises[4].id,
      exercise_id_6: exercises[5].id,
      exercise_id_7: exercises[6].id,
    };

    const { error: userExerciseError } = await supabase
      .from('user_exercise')
      .insert([userExerciseInsert]);

    if (userExerciseError) {
      throw new Error(userExerciseError.message);
    }

    return res.json({
      exercises: exercises, 
    });
  } catch (e) {
    console.error("Error in /latest-data-with-exercises:", e);
    return res.status(500).json({ error: 'Failed to fetch data and exercises', message: e.message });
  }
});


//fetch latest exercise data
app.get('/latest-exercise-data', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('exercise_data')
      .select('*')
      .order('created_at', { ascending: false }) 
      .limit(7);  //latest 7 records

    if (error) {
      throw new Error(error.message);
    }

    if (data.length === 0) {
      return res.status(404).json({ error: 'No exercise data found' });
    }

    return res.json({
      message: 'Latest exercise data fetched successfully',
      data: data,
    });
  } catch (e) {
    console.error("Error in /latest-exercise-data:", e);
    return res.status(500).json({ error: 'Failed to fetch exercise data', message: e.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
