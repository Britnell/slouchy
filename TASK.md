ok, we have a working demo ofwebcam posture and face landmark detection, and then detecting slouch bad posture from it.
see camera.ts and app.ts

nowww lets turn it into first preact app!
- the app wont need webrtc anymore, we assume either user is using laptop, or phone is running detection + notifications
- so i guess it just starts in the 'ready' view. user clicks button to start. 
-  tho we can maybe preload the models before that.
- w click of a button unfold/ open debug panel showing values in table just like now in app.ts
- w click of button show camera with canvas drawn over it from camera.ts

lets start with that basic first. focus on a clean implementation of webrtc and data flow
IMPORTANTLY
- do not make changes to existing scripts, we want the old demo to continue working. so copy them into a new app/ folder or so and modify there where necessary to fit our needs
