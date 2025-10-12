## General rules about handling data:
- use relative paths, relative to the main kanban file for all data storage, except for included files, they use relative paths to theyr own location.
- use the data chache to store modifications unless the user saves the data.
- the default for save/reload actions is to not save and not reload. pressing escape should show the dialogue again.
- Never modify the save data without the users permission.

## General rules about the code:
- use KISS when creating code.
	- create classes if some parts of the data is mostly only handled by the contained functions.
  - create functions if theyr functionality is used in more then one place.
	- create functions to separate different functionalities.
	- make sure to only create new variables if the data is nowhere else stored (an exeption might be the separated front and backend)
	- never store the same information in mutiple places, except if the user wants that. cleanup all data duplication that you detect after discussing it with the user. make sure the data is placed at the most appropriate place and create functions to retreive the single point of knowledge.
		- one exception in this code is the kanban board which is stored in the front and the backend (intentional sync between layers).
		- within each layer (frontend or backend), maintain only ONE reference to each piece of data.
		- keep a list of the single points of data in tmp/single-points-of-knowledge.md and update it when adding new data storage.
- never remove functionality without the users consent.
- if you cleanup code, allways check what the code does, create a list of these features and reimplement all these features.
- Never try to add an alternative implementation. 
- Dont try to add failsaves or backup solutions, we need the general execution to be perfect.
- Implmement the requested features according to the request. 
- Keep changes small. 
- Suggest DRY cleanups if you find functions get similar functionality. 
- Before creating a new functionality or creating larger code parts allways consult the FUNCTIONS.md. 
- Keep a FUNCTIONS.md actual and update after each modification, the file keeps track of all functions in the code in front and backend. Each functions is described as: 
	- path_to_filename-classname_functionname or -functionname when it's not in a class.
	- a description of the functionality in 1 or 2 lines of keywords or sentences.
- Be very careful and think carefully when i type in capital letters! Be extremely careful and check at least three times with different aspects when i use swear-words.$
- NEVER ADD ANYTHING I DONT ASK FOR! Do not invent features or requirements when i dont ask for them. If you think they are needed, ask me.
- When replacing or removing something, allways analyze what it was used for.
- Allways create completely functional code, never implement any partial, demo or abstract code. Integrate it into the complete codebase.

## Error handling:
- allways check for compile errors
- allways check for log messages that could be removed or made to show up less often.
- allways use a tag to add to log files such s [kanban.functionname.topic-debug-label]
- if you add logs, make sure they are at keypoints of relevant data modifications. only add logs to code instances when data is modified, keep logs that are triggered by events minimal. minimize the number of logs in the code. check front and backend and remove any unneeded logs except errors and warnings, or logs related to the current task.

## GIT handling:
- after finishing a problem and before working on another cleanup the obsolete and unused changes. comiit before doing this and after.
- before working on a new feature make a branch.
- after finishing working on a feature merge the branch with main.

## General rules about your behaviour:
- dont be overly optimistic, ony things that are tested are proved, othervise we assume it's still broken.
- use files to store informations that you can use in this working session. store them in ./tmp/ dont add them to the repository, dont add changes of files in the ./tests to the reposority
- allways think, for every time we try to recolve an unfixed problem think even harder.
- never implement any mock code. allways fully implement it, in the most simple way.
- after working on a problem and verifying that it's solved, check if any of the changes are obsolete or unneeded and remove these changes if it's so.
- Do not assume, rather ask if something is required to implement a feature or change
- If we worked on a problem which was not successfully solved, analyze what might have gone wrong and dont repeat the error.