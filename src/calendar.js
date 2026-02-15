    // --- CONFIGURATION ---
    const CLIENT_ID = '860390455759-vl0hc76obsfgne5f38182q77lsfigomh.apps.googleusercontent.com'; // From Google Cloud Console
    const API_KEY = 'AIzaSyDePihMOrxvx9BiuP3wHRFMFhzMc7Uk6xY';     // From Google Cloud Console
    const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

    let tokenClient;
    let gapiInited = false;
    let gisInited = false;
    let calendar; // FullCalendar instance

    // --- 1. INITIALIZATION ---

    // Load Google API Client (for data)
    function gapiLoaded() {
      gapi.load('client', async () => {
        await gapi.client.init({
          apiKey: API_KEY,
          discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"],
        });
        gapiInited = true;
        maybeEnableButtons();
      });
    }

    // Load Google Identity Services (for login)
    function gisLoaded() {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // defined later in handleAuthClick
      });
      gisInited = true;
      maybeEnableButtons();
    }

    function maybeEnableButtons() {
      if (gapiInited && gisInited) {
        document.getElementById('authorize_button').style.display = 'block';
        initFullCalendar(); // Initialize calendar now, but it will be empty until login
      }
    }

    // --- 2. AUTHENTICATION ---

    function handleAuthClick() {
      tokenClient.callback = async (resp) => {
        if (resp.error) {
          throw resp;
        }
        // Success! Hide button and refresh calendar to trigger the fetch
        document.getElementById('authorize_button').style.display = 'none';
        calendar.refetchEvents();
      };

      // Request access token
      if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
      } else {
        tokenClient.requestAccessToken({prompt: ''});
      }
    }

    // --- 3. FULLCALENDAR SETUP ---

    function initFullCalendar() {
      var calendarEl = document.getElementById('calendar');

      calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',

        // THE MAGIC PART: Custom Event Function
        events: async function(info, successCallback, failureCallback) {

          // If user is not logged in, return empty array
          if (gapi.client.getToken() === null) {
             successCallback([]);
             return;
          }

          try {
            // Call Google API with the time range from FullCalendar
            const response = await gapi.client.calendar.events.list({
              'calendarId': 'primary', // 'primary' = the logged-in user's calendar
              'timeMin': info.startStr, // FullCalendar provides these dates
              'timeMax': info.endStr,
              'showDeleted': false,
              'singleEvents': true,
              'maxResults': 100,
              'orderBy': 'startTime'
            });

            // Map Google Events to FullCalendar Events
            const events = response.result.items.map(event => {
              return {
                title: event.summary,
                start: event.start.dateTime || event.start.date, // Handle timed vs all-day events
                end: event.end.dateTime || event.end.date,
                url: event.htmlLink, // Link to the event in Google Calendar
                // You can map other fields here (color, description, etc.)
              };
            });

            successCallback(events);

          } catch (err) {
            console.error("Error fetching events", err);
            failureCallback(err);
          }
        }
      });

      calendar.render();
    }