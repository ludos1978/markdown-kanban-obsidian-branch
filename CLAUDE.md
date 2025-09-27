## General work order

Create a file FUNCTIONS.md that keeps track of all functions in files in front and backend. Each functions is described as: 
- path_to_filename-classname_functionname or -functionname when it's not in a class.
- a description of the functionality in 1 or 2 lines of keywords or sentences.

Implmement the requested features according to the request. Keep changes small. Suggest DRY cleanups if you find functions get similar functionality. Before creating a new functionality or creating larger code parts allways consult the FUNCTIONS.md. Never modify the save data without the users permission. After modifying the code update the FUNCTIONS.md according to the rules:
Each functions is described as: 
- path_to_filename-classname_functionname or -functionname when it's not in a class.
- a description of the functionality in 1 or 2 lines of keywords or sentences.

Never try to add an alternative implementation. Dont try to add failsaves or backup solutions, we need the general execution to be perfect.

if you add logs, make sure they are at keypoints of relevant data modifications. only add logs to code instances when data is modified, keep logs that are triggered by events minimal. minimize the number of logs in the code. check front and backend and remove any unneeded logs except errors and warnings, or logs related to the current task.

General rules:
- use relative paths, relative to the main kanban file for all data storage, except for included files, they use relative paths to theyr own location.
- use the data chache to store modifications unless the user saves the data.
- never remove functionality without the users consent.
- if you cleanup code, allways check what the code does, create a list of these features and reimplement all these features.
- dont be overly optimistic, ony things that are tested are proved, othervise we assume it's still broken.
- after finishing a problem and before working on another cleanup the obsolete and unused changes. comiit before doing this and after.
- before working on a new feature make a branch.
- after finishing working on a feature merge the branch with main.
- use files to store informations that you can use in this working session. store them in ./tmp/ dont add them to the repository, dont add changes of files in the ./tests to the reposority
- allways check for compile errors
- allways check for log messages that could be removed or made to show up less often.
- allways use a tag to add to log files such s [kanban.functionname.topic-debug-label]
- the default for save/reload actions is to not save and not reload. pressing escape should show the dialogue again.
- allways think, for every time we try to recolve an unfixed problem think even harder.