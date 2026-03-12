# Elevator Simulation

**Backend** installation guide:

Type these commands to run the backend:
 - I used venv but you don't have to
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.server:app --reload --port 8000
```

**Frontend** installaion guide:

Type these commands to run the frontend in a seperate terminal:
```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:3000. 

I have a couple of different scenarios, (high,medium, and low traffic). You can edit these files in elevator/backend/scenarios. I only have buttons to access these three scenarios on my webapp. 

## Input / Output (CLI)

I also recognize that this challenge wasn't instructed as a fullstack challenge, so I also included the CLI input/output in my code as well. I made the web app after doing this because it was pretty quick, and I thought I could do something more fun. 

Run this code from the elevator (root) directory: 
- **Input**: `elevator start=<N> floor=<f1>,<f2>,...`
    - example: python3 -m backend "elevator start=12 floor=2,9,1,32" 
- **Output**: `<total_travel_time> <floor1>,<floor2>,...`

### Extra Features

If this were a real elevator it would need:
- Emergency system: 
    - Something on the backend that when prompted drops the elevator to the first floor
    - There could also be different emergency modes, like sometimes you want the elevator to stay where it's at, but most of the time it should drop to the bottom
- Clear all destinations: 
    - Usually on elevators if you press the buttons in a certain order, it will clear all the destinations... say someone clicked every single button before exiting >:(
- Call emergency/rescue: 
    - A call button for when someone is in trouble, elevator should be hooked up to a landline so that this system is as reliable as possible
    - We should also automatically call emergency operators if the emergency system triggers, or if we notice the elevator has been stopped and people are inside
- Weight system:
    - While elevators can hold a lot of people, there is a limit and so our elevator should have some sort of scale and if the weight of everyone on the elevator is 80% of capacity, send an alarm so nobody can get in 
- Door not shutting on people:
    - In the simulation, the door should probably stay open longer if there are more people getting on the elevator 
    - It should also stay open longer when there are more people getting off the elevator
    - My simulation assumes that it's the same every time, and my constants right now assume everyone can teleport onto the elevator instantly when it's on their floor!